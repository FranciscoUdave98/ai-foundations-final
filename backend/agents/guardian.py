"""Guardian: the code layer of PaceLab's prompt-injection defense. Plain Python, no LLM.

Three jobs:
1. clean_untrusted(): turn stranger-written text (race names, descriptions) into what a person
   would actually see (hidden HTML, comments, zero-width and Unicode tag characters removed),
   then cut any sentence that tries to instruct an AI, plus links to unknown sites. Length-capped.
2. screen_output(): check what an agent wrote before a user sees it (no links, emails, phone
   numbers or instruction-like text survive).
3. wrap_untrusted(): label cleaned text as data for the prompt layer.

The heuristics look for *signals of an attack* (an override aimed at instructions, text
addressed to an AI, role or tag spoofing, tool names, steering the user to an unknown site)
rather than banned words, so normal race copy ("ignore the hills", "register early") passes.
It is one layer of three: the design layer (only the Race Scout sees race text; it has no tool
that acts; cards are rebuilt from structured fields) holds even if a sentence slips through.
"""

from __future__ import annotations

import html
import re
import unicodedata
from dataclasses import dataclass, field
from html.parser import HTMLParser
from urllib.parse import urlparse

PRE_CAP = 20_000

# Registration sites and race organizers that legitimately appear in race text.
KNOWN_DOMAINS = {
    "runsignup.com", "nyrr.org", "baa.org", "raceroster.com", "active.com", "runreg.com",
    "athlinks.com", "ultrasignup.com", "racewire.com", "imathlete.com", "hdsports.org",
    "runguides.com", "findmymarathon.com", "halfruns.com", "usatf.org",
}

ZERO_WIDTH = re.compile("[­᠎​-‏ -‮⁠-⁤⁦-⁩﻿]")
TAG_CHARS = re.compile("[\U000e0000-\U000e007f]")
URL = re.compile(r"\b(?:https?://|www\.)[^\s<>\"')]+", re.I)
DOMAIN = re.compile(r"\b((?:[a-z0-9-]+\.)+(?:com|net|org|io|co|xyz|info|biz|run|race|us|app|site|online|link|top))\b", re.I)
EMAIL = re.compile(r"\b[\w.+-]+@[\w-]+\.[\w.-]+\b")
PHONE = re.compile(r"(?<!\d)(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}(?!\d)")

# Each family is one kind of attack signal. A sentence that matches any of them is cut.
FAMILIES: dict[str, re.Pattern] = {
    "override": re.compile(
        r"\b(ignore|disregard|forget|override|bypass|drop)\b[^.!?\n]{0,40}?"
        r"\b(previous|prior|above|earlier|all|any|your|these|those|system|safety|the)\b[^.!?\n]{0,30}?"
        r"\b(instructions?|rules?|prompts?|directions?|guidelines?|guardrails?|polic(?:y|ies)|programming)\b", re.I),
    "role_spoof": re.compile(
        r"(^|[\n.!?]\s*)(system|assistant|developer)\s*:|<\|?\s*(im_start|im_end|system|endoftext)\s*\|?>|\[/?(INST|SYS)\]"
        r"|</?\s*(untrusted|race_text|system|instructions?|tool_call|function)[^>]*>|#{2,}\s*(system|instructions?)\b", re.I),
    "addressed_to_ai": re.compile(
        r"\b(note|message|instructions?|reminder)\s+(to|for)\s+(the\s+|any\s+)?(ai|assistant|llm|model|agent|bot|chatbot|scout)s?\b"
        r"|\b(dear|attention|hey|hello)\s*,?\s+(ai|assistant|llm|model|agent|chatbot|race scout)s?\b"
        r"|\byou\s+are\s+(now\s+)?(an?\s+|the\s+)?(ai|assistant|language model|llm|chatbot|agent|race scout)\b"
        r"|\bas an ai\b|\b(ai|llm|language model|assistant|agent)s?\s+(must|should|shall|need to|are required to)\b"
        r"|\b(new|updated|real|true)\s+(instructions|task|role|persona|objective)\b", re.I),
    "tool_coercion": re.compile(
        r"\bregister_for_race\b|\bfunction[_ ]call\b"
        r"|\b(call|use|invoke|run|execute|trigger)\s+(the\s+)?[\w-]+\s+(tool|function)\b", re.I),
    "secret_probe": re.compile(
        r"\b(system prompt|developer message|api key|hidden instructions|your instructions)\b"
        r"|\breveal\s+(your|the)\s+(prompt|instructions|rules)\b", re.I),
    "steer_user": re.compile(
        r"\b(tell|instruct|ask|urge|direct|advise|inform|remind|convince)\s+(the\s+|all\s+)?(user|users)\b", re.I),
}
CALL_TO_ACTION = re.compile(r"\b(register|sign\s*up|pay|enter|visit|go to|click|buy|book|send|email)\b", re.I)


@dataclass
class CleanReport:
    text: str
    flags: list[str] = field(default_factory=list)      # what was found, e.g. hidden_html, injection
    removed: list[dict] = field(default_factory=list)   # [{"why": ..., "text": ...}] for the safety log
    blocked: bool = False                               # whole field withheld

    def add(self, flag: str, why: str, text: str) -> None:
        if flag not in self.flags:
            self.flags.append(flag)
        self.removed.append({"why": why, "text": text.strip()[:200]})

    @property
    def suspicious(self) -> bool:
        return bool({"injection", "offsite_link", "hidden_html", "html_comment", "unicode_tag_chars"} & set(self.flags))


# ---------------------------------------------------------------- hidden text

HIDDEN_STYLE = re.compile(
    r"display\s*:\s*none|visibility\s*:\s*hidden|font-size\s*:\s*0(?![.\d]*[1-9])|opacity\s*:\s*0(?![.\d]*[1-9])"
    r"|(?<![-\w])color\s*:\s*(#fff(fff)?\b|white\b|transparent\b|rgba?\(\s*255\s*,\s*255\s*,\s*255)"
    r"|(?:height|width|max-height)\s*:\s*0(px)?\s*(;|$)|(?:left|top|text-indent)\s*:\s*-\d{3,}", re.I)
HIDDEN_CLASS = re.compile(r"\b(sr-only|visually-hidden|hidden|d-none|invisible|screen-reader-text)\b", re.I)
INVISIBLE_TAGS = {"script", "style", "template", "noscript", "head", "title", "meta", "iframe", "object", "svg"}
VOID_TAGS = {"br", "img", "hr", "input", "meta", "link", "area", "base", "col", "embed", "source", "track", "wbr"}
BLOCK_TAGS = {"p", "div", "br", "li", "tr", "h1", "h2", "h3", "h4", "h5", "h6", "section", "article", "ul", "ol", "table"}


class _VisibleText(HTMLParser):
    def __init__(self, report: CleanReport):
        super().__init__(convert_charrefs=True)
        self.report = report
        self.stack: list[tuple[str, bool]] = []
        self.out: list[str] = []
        self.hidden_buf: list[str] = []

    @property
    def hidden(self) -> bool:
        return any(h for _, h in self.stack)

    def handle_starttag(self, tag, attrs):
        if tag in BLOCK_TAGS:
            self.out.append(" ")
        if tag in VOID_TAGS:
            return
        a = {k.lower(): (v or "") for k, v in attrs}
        why = None
        if tag in INVISIBLE_TAGS:
            why = f"<{tag}> element"
        elif "hidden" in a or a.get("aria-hidden", "").lower() == "true":
            why = "hidden attribute"
        elif HIDDEN_STYLE.search(a.get("style", "")):
            why = f"hidden style ({HIDDEN_STYLE.search(a['style']).group(0)})"
        elif HIDDEN_CLASS.search(a.get("class", "")):
            why = "hidden class"
        if why and not self.hidden:
            self.hidden_buf = [why]
        self.stack.append((tag, bool(why)))

    def handle_endtag(self, tag):
        for i in range(len(self.stack) - 1, -1, -1):
            if self.stack[i][0] == tag:
                was_hidden = self.hidden
                del self.stack[i:]
                if was_hidden and not self.hidden and self.hidden_buf:
                    why, *texts = self.hidden_buf
                    if "".join(texts).strip():
                        self.report.add("hidden_html", why, " ".join(texts))
                    self.hidden_buf = []
                break
        if tag in BLOCK_TAGS:
            self.out.append(" ")

    def handle_data(self, data):
        if self.hidden:
            self.hidden_buf.append(data)
        else:
            self.out.append(data)

    def handle_comment(self, data):
        if data.strip():
            self.report.add("html_comment", "HTML comment", data)


def _strip_hidden(text: str, report: CleanReport) -> str:
    tags = TAG_CHARS.findall(text)
    if tags:
        smuggled = "".join(chr(ord(c) - 0xE0000) for c in tags if 0x20 <= ord(c) - 0xE0000 < 0x7F)
        report.add("unicode_tag_chars", "invisible Unicode tag characters", smuggled or "(non-printing)")
        text = TAG_CHARS.sub("", text)
    if ZERO_WIDTH.search(text):
        report.add("zero_width", "zero-width / direction-control characters", f"{len(ZERO_WIDTH.findall(text))} characters")
        text = ZERO_WIDTH.sub("", text)
    text = unicodedata.normalize("NFKC", text)
    text = "".join(ch for ch in text if ch in "\n\t" or unicodedata.category(ch)[0] != "C")
    if re.search(r"<\s*[a-zA-Z!/]", text):
        parser = _VisibleText(report)
        parser.feed(text)
        parser.close()
        if parser.hidden and parser.hidden_buf[1:]:                # unclosed hidden element at the end
            report.add("hidden_html", parser.hidden_buf[0], " ".join(parser.hidden_buf[1:]))
        text = "".join(parser.out)
    else:
        text = html.unescape(text)
    return re.sub(r"\s+", " ", text).strip()


# ---------------------------------------------------------------- instruction-like sentences and links

def _domain_ok(domain: str, allowed: set[str]) -> bool:
    d = domain.lower().removeprefix("www.")
    return any(d == a or d.endswith("." + a) for a in allowed)


def _sentences(text: str) -> list[str]:
    return [s for s in re.split(r"(?<=[.!?])\s+|\n+", text) if s.strip()]


def _scan(text: str, report: CleanReport, allowed: set[str]) -> str:
    kept = []
    sentences = _sentences(text)
    for i, sentence in enumerate(sentences):
        hits = [name for name, rx in FAMILIES.items() if rx.search(sentence)]
        foreign = [d for d in DOMAIN.findall(sentence) if not _domain_ok(d, allowed)]
        if foreign and CALL_TO_ACTION.search(sentence):
            hits.append("offsite_call_to_action")
        if hits:
            flag = "offsite_link" if hits == ["offsite_call_to_action"] else "injection"
            report.add(flag, ", ".join(hits), sentence)
            if flag == "injection" and i + 1 < len(sentences):
                # An attack rarely stops at one sentence: whatever follows it is the payload.
                report.add("injection", "text after an injection", " ".join(sentences[i + 1:]))
                break
            continue
        kept.append(sentence)
    out = " ".join(kept)
    for rx, label in ((URL, "link"), (EMAIL, "email address"), (PHONE, "phone number")):
        for m in rx.findall(out):
            m = m if isinstance(m, str) else m[0]
            report.add("link_removed", f"{label} removed", m)
        out = rx.sub("(see the official race page)", out)
    return re.sub(r"\s+([,.;:!?])", r"\1", re.sub(r"\s+", " ", out)).strip()


def _cap(text: str, max_chars: int, report: CleanReport) -> str:
    if len(text) <= max_chars:
        return text
    report.flags.append("truncated")
    cut = text[:max_chars].rsplit(" ", 1)[0]
    return cut.rstrip(",;:") + "…"


def clean_untrusted(raw: str, source: str = "", max_chars: int = 600,
                    allowed_domains: set[str] | None = None) -> CleanReport:
    """Visible, instruction-free, length-capped text from a stranger-written field."""
    report = CleanReport(text="")
    allowed = KNOWN_DOMAINS | (allowed_domains or set())
    raw = (raw or "")[:PRE_CAP]
    text = _strip_hidden(raw, report)
    text = _scan(text, report, allowed)
    short_field = max_chars <= 120
    if short_field and ("injection" in report.flags or "offsite_link" in report.flags):
        report.blocked = True
        report.text = ""
        return report
    report.text = _cap(text, max_chars, report)
    return report


def domain_of(url: str | None) -> set[str]:
    if not url:
        return set()
    host = urlparse(url).hostname or ""
    return {host.removeprefix("www.")} if host else set()


# ---------------------------------------------------------------- agent output and prompt wrapping

def screen_output(text: str | None, max_chars: int) -> tuple[str | None, list[str]]:
    """What an agent wrote, made safe to show: no links/contacts, no instruction-like text."""
    if not text:
        return None, []
    report = CleanReport(text="")
    cleaned = _strip_hidden(text, report)
    cleaned = _scan(cleaned, report, set())          # agents may not cite any site at all
    if "injection" in report.flags or "offsite_link" in report.flags:
        return None, report.flags
    return (_cap(cleaned, max_chars, report) or None), report.flags


def wrap_untrusted(race_id: str, text: str) -> str:
    """Prompt layer: cleaned race text inside a labeled data block it cannot close."""
    safe = html.escape(text, quote=False)
    return f'<race_text id="{race_id}" trust="untrusted-data">{safe}</race_text>'
