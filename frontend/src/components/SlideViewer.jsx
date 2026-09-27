export default function SlideViewer({ state }) {
  const slide = state.slides[state.current_slide]
  return <article className="slide-surface" aria-label="Current presentation slide">
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-5 text-sm text-slate-500">
      <span>{slide.subtitle}</span>
      <span data-testid="slide-number" className="shrink-0 font-medium tabular-nums text-slate-700">Slide {state.current_slide + 1} of {state.slides.length}</span>
    </div>
    <div className="py-8 sm:py-10">
      <h2 className="max-w-3xl text-2xl font-semibold leading-tight tracking-tight text-slate-950 sm:text-3xl lg:text-4xl">{slide.title}</h2>
      <ul className="mt-7 max-w-3xl space-y-5 text-base leading-7 text-slate-700 sm:text-lg">
        {slide.points.map(point => <li key={point} className="flex gap-3"><span aria-hidden="true" className="mt-[0.55em] size-1.5 shrink-0 rounded-full bg-teal-700" />{point}</li>)}
      </ul>
    </div>
    <p className="border-t border-slate-200 pt-4 text-xs text-slate-500">Sample lecture slides</p>
  </article>
}
