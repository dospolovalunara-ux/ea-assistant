'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard, Calendar, CheckSquare, Briefcase,
  Users, Plane, Receipt, GraduationCap, MessageSquare, DollarSign
} from 'lucide-react'

const nav = [
  { href: '/',           label: 'Дашборд',        icon: LayoutDashboard },
  { href: '/meetings',   label: 'Встречи',          icon: Calendar },
  { href: '/tasks',      label: 'Задачи',           icon: CheckSquare },
  { href: '/travel',     label: 'Командировки',     icon: Plane },
  { href: '/hr',         label: 'HR / Табель',      icon: Users },
  { href: '/training',   label: 'Вайбкодинг',       icon: GraduationCap },
  { href: '/expenses',   label: 'Расходы',          icon: DollarSign },
  { href: '/chat',       label: 'AI Ассистент',     icon: MessageSquare },
]

export default function Sidebar() {
  const path = usePathname()
  return (
    <aside className="w-56 bg-white border-r border-slate-100 flex flex-col shrink-0">
      <div className="px-5 py-5 border-b border-slate-100">
        <div className="text-xs font-semibold text-brand-600 uppercase tracking-widest mb-0.5">EA Assistant</div>
        <div className="text-xs text-slate-400">Казахтелеком</div>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {nav.map(({ href, label, icon: Icon }) => {
          const active = path === href || (href !== '/' && path.startsWith(href))
          return (
            <Link key={href} href={href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all',
                active
                  ? 'bg-brand-50 text-brand-700'
                  : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
              )}
            >
              <Icon size={16} className={active ? 'text-brand-500' : ''} />
              {label}
            </Link>
          )
        })}
      </nav>
      <div className="px-5 py-4 border-t border-slate-100 text-xs text-slate-400">
        v1.0 · 2026
      </div>
    </aside>
  )
}
