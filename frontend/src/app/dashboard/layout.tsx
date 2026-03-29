import Link from 'next/link'
import { UserButton } from '@clerk/nextjs'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="w-56 flex flex-col justify-between bg-gray-900 text-white px-4 py-6 shrink-0">
        <div>
          <p className="text-xl font-bold mb-8">SMP</p>
          <nav className="flex flex-col gap-1">
            <Link
              href="/dashboard/goals"
              className="rounded px-3 py-2 text-sm hover:bg-gray-700 transition-colors"
            >
              Goals
            </Link>
            <Link
              href="/dashboard/decisions"
              className="rounded px-3 py-2 text-sm hover:bg-gray-700 transition-colors"
            >
              Decisions
            </Link>
            <Link
              href="/dashboard/ai-log"
              className="rounded px-3 py-2 text-sm hover:bg-gray-700 transition-colors"
            >
              AI log
            </Link>
          </nav>
        </div>
        <div className="p-4 border-t border-gray-200 dark:border-gray-700">
          <UserButton />
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 bg-gray-50 p-8 overflow-auto">
        {children}
      </main>
    </div>
  )
}
