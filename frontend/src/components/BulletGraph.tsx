'use client'
import React from 'react'

interface Range {
  label: string
  max: number
  color: string
}

interface BulletGraphProps {
  title: string
  value: number
  target: number
  ranges: Range[]
  unit?: string
  height?: number
}

export default function BulletGraph({
  title,
  value,
  target,
  ranges,
  unit = '',
  height = 40,
}: BulletGraphProps) {
  const maxValue = ranges[ranges.length - 1].max
  const toPercent = (n: number) => (n / maxValue) * 100

  return (
    <div className="flex items-center gap-3 w-full">
      {/* Title */}
      <span className="text-sm font-medium text-gray-600 w-40 shrink-0 text-right">
        {title}
      </span>

      {/* SVG graph */}
      <div className="flex-1">
        <svg
          viewBox={`0 0 100 ${height}`}
          preserveAspectRatio="none"
          className="w-full"
          style={{ height }}
        >
          {/* Ranges (background bands) */}
          {ranges.map((range, i) => {
            const prevMax = i === 0 ? 0 : ranges[i - 1].max
            const x = toPercent(prevMax)
            const w = toPercent(range.max) - x
            return (
              <rect
                key={range.label}
                x={`${x}%`}
                y={0}
                width={`${w}%`}
                height={height}
                fill={range.color}
              />
            )
          })}

          {/* Value bar (60% height, vertically centred) */}
          <rect
            x="0"
            y={`${height * 0.2}`}
            width={`${toPercent(value)}%`}
            height={height * 0.6}
            fill="#1e40af"
          />

          {/* Target tick */}
          <rect
            x={`${toPercent(target)}%`}
            y={0}
            width="0.5%"
            height={height}
            fill="#111827"
          />
        </svg>
      </div>

      {/* Value label */}
      <span className="text-sm font-semibold text-gray-800 w-16 shrink-0">
        {value}{unit} / {target}{unit}
      </span>
    </div>
  )
}