import { useId } from 'react'

export default function WorkspaceTabs({ label, value, onChange, items, stages = false }) {
  const id = useId()
  return <div className={'workspace-tabs ' + (stages ? 'stage-navigation' : '')} role="tablist" aria-label={label}>
    {items.map((item, index) => <button key={item.value} id={`${id}-${item.value}`} type="button"
      role="tab" aria-label={item.label} aria-selected={value === item.value} tabIndex={value === item.value ? 0 : -1}
      onClick={() => onChange(item.value)} onKeyDown={event => {
        let next
        if (event.key === 'ArrowRight') next = (index + 1) % items.length
        if (event.key === 'ArrowLeft') next = (index + items.length - 1) % items.length
        if (event.key === 'Home') next = 0
        if (event.key === 'End') next = items.length - 1
        if (next !== undefined) {
          event.preventDefault()
          onChange(items[next].value)
          document.getElementById(`${id}-${items[next].value}`)?.focus()
        }
      }}>{stages && <span className="stage-number">0{index + 1}</span>}<span className="stage-copy"><span>{item.label}</span>{stages && item.description && <small>{item.description}</small>}</span></button>)}
  </div>
}
