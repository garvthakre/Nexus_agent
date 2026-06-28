'use client'

interface StatCardProps {
  label: string
  value: string
  color: string
}

export default function StatCard({ label, value, color }: StatCardProps) {
  return (
    <div className="bg-s1 border border-border rounded-[10px] p-[12px_14px]">
      <div className="font-mono text-[8.5px] text-dim tracking-[0.07em] mb-1">{label}</div>
      <div className={`font-display text-[22px] ${color}`}>{value}</div>
    </div>
  )
}
