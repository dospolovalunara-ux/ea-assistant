'use client'
import { useStore } from '@/lib/store'
import { formatDate, formatMoney, daysUntil, PRIORITY_LABEL, STATUS_LABEL } from '@/lib/utils'
import Link from 'next/link'
import { Calendar, CheckSquare, Plane, AlertTriangle, Clock, TrendingUp, Users, DollarSign } from 'lucide-react'

export default function Dashboard() {
  const { tasks, meetings, travelRequests, leaveRequests, personalExpenses, trainings } = useStore()

  const today = new Date().toISOString().slice(0, 10)

  const urgentTasks = tasks.filter(t => t.status !== 'done' && t.status !== 'cancelled' && (t.priority === 'urgent' || t.priority === 'high'))
  const pendingTasks = tasks.filter(t => t.status === 'pending' || t.status === 'in_progress')
  const overdueTasks = tasks.filter(t => t.status !== 'done' && t.status !== 'cancelled' && t.dueDate < today)

  const upcomingMeetings = meetings
    .filter(m => m.date >= today)
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
    .slice(0, 4)

  const activeTravels = travelRequests.filter(t => t.status === 'approved' || t.status === 'submitted')
  const pendingLeaves = leaveRequests.filter(l => l.status === 'pending')
  const unreimbursed = personalExpenses.filter(e => !e.reimbursed)
  const unreimbursedTotal = unreimbursed.reduce((s, e) => s + e.amount, 0)

  const nextTraining = trainings.filter(t => t.date >= today && t.status === 'scheduled').sort((a, b) => a.date.localeCompare(b.date))[0]

  const MEETING_TYPE_BADGE: Record<string, string> = {
    board: 'badge-purple', internal: 'badge-blue', external: 'badge-green', training: 'badge-yellow'
  }
  const MEETING_TYPE_LABEL: Record<string, string> = {
    board: 'Board', internal: 'Internal', external: 'External', training: 'Training'
  }
  const PRIORITY_BADGE: Record<string, string> = {
    urgent: 'badge-red', high: 'badge-yellow', medium: 'badge-blue', low: 'badge-gray'
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Добро пожаловать</h1>
        <p className="text-slate-400 text-sm mt-1">{new Date().toLocaleDateString('ru-KZ', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard icon={<CheckSquare size={18} />} label="Задач активно" value={pendingTasks.length.toString()}
          sub={overdueTasks.length > 0 ? `${overdueTasks.length} просрочено` : 'Всё в срок'}
          subColor={overdueTasks.length > 0 ? 'text-red-500' : 'text-emerald-500'}
          href="/tasks" color="bg-brand-50 text-brand-600" />
        <StatCard icon={<Calendar size={18} />} label="Встреч предстоит" value={upcomingMeetings.length.toString()}
          sub={upcomingMeetings[0] ? upcomingMeetings[0].date === today ? 'Сегодня есть встречи' : `Следующая ${formatDate(upcomingMeetings[0]?.date)}` : 'Встреч нет'}
          subColor="text-slate-400" href="/meetings" color="bg-purple-50 text-purple-600" />
        <StatCard icon={<Plane size={18} />} label="Командировок" value={activeTravels.length.toString()}
          sub={`${pendingLeaves.length} заявок на отпуск`} subColor="text-slate-400"
          href="/travel" color="bg-amber-50 text-amber-600" />
        <StatCard icon={<DollarSign size={18} />} label="Расходы к возврату" value={formatMoney(unreimbursedTotal)}
          sub={`${unreimbursed.length} позиций`} subColor="text-slate-400"
          href="/expenses" color="bg-emerald-50 text-emerald-600" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Urgent tasks */}
        <div className="card lg:col-span-1">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-slate-700 flex items-center gap-2"><AlertTriangle size={15} className="text-red-400" />Срочные задачи</h2>
            <Link href="/tasks" className="text-xs text-brand-500 hover:underline">Все</Link>
          </div>
          <div className="space-y-2">
            {urgentTasks.length === 0 && <p className="text-sm text-slate-400">Нет срочных задач</p>}
            {urgentTasks.slice(0, 5).map(t => {
              const d = daysUntil(t.dueDate)
              return (
                <div key={t.id} className="flex items-start gap-2 p-2 rounded-xl hover:bg-slate-50 transition">
                  <span className={`badge mt-0.5 shrink-0 ${PRIORITY_BADGE[t.priority]}`}>{PRIORITY_LABEL[t.priority]}</span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-700 truncate">{t.title}</p>
                    <p className={`text-xs ${d < 0 ? 'text-red-500' : d === 0 ? 'text-amber-500' : 'text-slate-400'}`}>
                      {d < 0 ? `Просрочено на ${Math.abs(d)} дн.` : d === 0 ? 'Сегодня' : `Через ${d} дн. · ${formatDate(t.dueDate)}`}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Upcoming meetings */}
        <div className="card lg:col-span-1">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-slate-700 flex items-center gap-2"><Clock size={15} className="text-brand-400" />Предстоящие встречи</h2>
            <Link href="/meetings" className="text-xs text-brand-500 hover:underline">Все</Link>
          </div>
          <div className="space-y-3">
            {upcomingMeetings.length === 0 && <p className="text-sm text-slate-400">Встреч нет</p>}
            {upcomingMeetings.map(m => (
              <div key={m.id} className="flex gap-3">
                <div className="text-center shrink-0 w-10">
                  <div className="text-lg font-bold text-brand-600 leading-none">{new Date(m.date).getDate()}</div>
                  <div className="text-xs text-slate-400">{new Date(m.date).toLocaleDateString('ru-KZ', { month: 'short' })}</div>
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-700 truncate">{m.title}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-slate-400">{m.time} · {m.duration} мин</span>
                    <span className={`badge ${MEETING_TYPE_BADGE[m.type]}`}>{MEETING_TYPE_LABEL[m.type]}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Quick overview */}
        <div className="card lg:col-span-1">
          <h2 className="font-semibold text-slate-700 mb-4 flex items-center gap-2"><TrendingUp size={15} className="text-emerald-400" />Обзор</h2>
          <div className="space-y-3">
            <InfoRow label="Заявок на отпуск" value={`${pendingLeaves.length} на согласовании`} badge="badge-yellow" />
            <InfoRow label="Командировок активно" value={activeTravels.length.toString()} badge="badge-blue" />
            <InfoRow label="Расходы к возврату" value={formatMoney(unreimbursedTotal)} badge="badge-red" />
            {nextTraining && (
              <InfoRow label="Вайбкодинг" value={`${formatDate(nextTraining.date)} · ${nextTraining.participants.length} чел.`} badge="badge-green" />
            )}
            <div className="pt-2 border-t border-slate-100 mt-2">
              <p className="text-xs text-slate-400 mb-2">Быстрые действия</p>
              <div className="flex flex-wrap gap-2">
                <Link href="/meetings?new=1" className="btn-primary text-xs px-3 py-1.5">+ Встреча</Link>
                <Link href="/tasks?new=1" className="btn-ghost text-xs px-3 py-1.5">+ Задача</Link>
                <Link href="/travel?new=1" className="btn-ghost text-xs px-3 py-1.5">+ Командировка</Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function StatCard({ icon, label, value, sub, subColor, href, color }: {
  icon: React.ReactNode; label: string; value: string; sub: string;
  subColor: string; href: string; color: string
}) {
  return (
    <Link href={href} className="card hover:shadow-md transition-shadow">
      <div className="flex items-center gap-3 mb-3">
        <div className={`p-2 rounded-xl ${color}`}>{icon}</div>
        <span className="text-xs text-slate-400 font-medium">{label}</span>
      </div>
      <div className="text-2xl font-bold text-slate-800 mb-1">{value}</div>
      <div className={`text-xs ${subColor}`}>{sub}</div>
    </Link>
  )
}

function InfoRow({ label, value, badge }: { label: string; value: string; badge: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-slate-500">{label}</span>
      <span className={badge}>{value}</span>
    </div>
  )
}
