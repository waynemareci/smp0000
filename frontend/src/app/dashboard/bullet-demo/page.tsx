import BulletGraph from '@/components/BulletGraph'

const RANGES = [
  { label: 'poor', max: 33,  color: '#e5e7eb' },
  { label: 'ok',   max: 66,  color: '#d1d5db' },
  { label: 'good', max: 100, color: '#9ca3af' },
]

export default function BulletDemoPage() {
  return (
    <div className="p-8 flex flex-col gap-6 max-w-2xl">
      <h1 className="text-xl font-bold">Bullet Graph — Demo</h1>
      <BulletGraph
        title="Milestones Complete"
        value={42}
        target={75}
        ranges={RANGES}
        unit="%"
      />
      <BulletGraph
        title="Tasks Closed"
        value={8}
        target={12}
        ranges={[
          { label: 'low',    max: 5,  color: '#fce7f3' },
          { label: 'medium', max: 10, color: '#fbcfe8' },
          { label: 'high',   max: 15, color: '#f9a8d4' },
        ]}
        unit=" tasks"
      />
      <BulletGraph
        title="Decisions Logged"
        value={3}
        target={5}
        ranges={[
          { label: 'none', max: 2, color: '#e5e7eb' },
          { label: 'some', max: 4, color: '#d1d5db' },
          { label: 'good', max: 6, color: '#9ca3af' },
        ]}
      />
    </div>
  )
}