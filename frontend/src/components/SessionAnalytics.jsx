export default function SessionAnalytics({ state }) {
  const released = (state.activities || []).filter(item => item.status === 'released')
  const explanations = state.explanations || []
  const feedback = state.current_feedback
  const metrics = [
    ['Connected students', state.connected_students],
    ['Slides', state.slides.length],
    ['Released activities', released.length],
    ['Answer submissions', released.reduce((total, item) => total + item.total_submissions, 0)],
    ['Anonymous questions', (state.anonymous_questions || []).length],
    ['AI explanations generated', explanations.length],
    ['Shared explanations', explanations.filter(item => item.status === 'shared').length],
  ]

  return <section className="session-analytics" aria-labelledby="analytics-title" data-testid="session-analytics">
    <div className="session-analytics-heading">
      <div>
        <h2 id="analytics-title">Session Analytics</h2>
        <p>{state.title} · Code {state.code} · {state.status === 'active' ? 'Active' : 'Ended'}</p>
      </div>
    </div>
    <dl className="session-analytics-metrics">
      {metrics.map(([label, value]) => <div key={label}>
        <dt>{label}</dt><dd>{value}</dd>
      </div>)}
    </dl>
    <div className="session-analytics-detail">
      <p><strong>Potential confusion slides:</strong> {(state.flagged_slides || []).length
        ? state.flagged_slides.map(index => index + 1).join(', ') : 'None'}</p>
      <p><strong>Current slide {state.current_slide + 1} feedback:</strong> {feedback.total} feedback respondents;
        {' '}{feedback.understand} Understand, {feedback.not_understand} Not Understand
        {' '}({Math.round(feedback.not_understand_percent)}% Not Understand).</p>
    </div>
    <p className="session-analytics-note">Answer submissions are counted per activity and may include several answers from one student. This report lasts only while the backend session is running.</p>
  </section>
}
