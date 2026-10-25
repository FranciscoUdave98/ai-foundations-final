interface Props {
  badge: string
  title: string
  text: string
  bullets?: string[]
}

export function ComingSoon({ badge, title, text, bullets }: Props) {
  return (
    <div className="card soon">
      <span className="badge">{badge}</span>
      <h2>{title}</h2>
      <p>{text}</p>
      {bullets && <ul>{bullets.map((b) => <li key={b}>{b}</li>)}</ul>}
    </div>
  )
}
