'use client'
import { useState } from 'react'
import { useStore } from '@/lib/store'
import { uid, formatDate, cn, STATUS_LABEL } from '@/lib/utils'
import type { LeaveRequest, Employee } from '@/lib/types'
import { Plus, UserCheck, Calendar, Users } from 'lucide-react'

const LEAVE_TYPE_LABEL: Record<string, string> = { vacation: 'Отпуск', sick: 'Больничный', unpaid: 'Б/с', business: 'Командировка' }
const LEAVE_TYPE_BADGE: Record<string, string> = { vacation: 'badge-blue', sick: 'badge-red', unpaid: 'badge-gray', business: 'badge-yellow' }
const STATUS_BADGE: Record<string, string> = { pending: 'badge-yellow', in_progress: 'badge-blue', done: 'badge-green', cancelled: 'badge-gray' }

export default function HRPage() {
  const { employees, leaveRequests, addLeaveRequest, updateLeaveRequest, addEmployee } = useStore()
  const [tab, setTab] = useState<'leaves' | 'employees'>('leaves')
  const [showLeaveForm, setShowLeaveForm] = useState(false)
  const [showEmpForm, setShowEmpForm] = useState(false)
  const [leaveForm, setLeaveForm] = useState<Partial<LeaveRequest>>({ type: 'vacation', status: 'pending' })
  const [empForm, setEmpForm] = useState<Partial<Employee>>({})

  const today = new Date().toISOString().slice(0, 10)

  function saveLeave() {
    if (!leaveForm.employeeId || !leaveForm.startDate || !leaveForm.endDate) return
    const start = new Date(leaveForm.startDate!)
    const end = new Date(leaveForm.endDate!)
    const days = Math.ceil((end.getTime() - start.getTime()) / 86400000) + 1
    const lr: LeaveRequest = {
      id: uid(), employeeId: leaveForm.employeeId!, type: (leaveForm.type as LeaveRequest['type']) ?? 'vacation',
      startDate: leaveForm.startDate!, endDate: leaveForm.endDate!, days,
      status: 'pending', reason: leaveForm.reason ?? '', createdAt: today,
    }
    addLeaveRequest(lr)
    setShowLeaveForm(false)
    setLeaveForm({ type: 'vacation', status: 'pending' })
  }

  function saveEmployee() {
    if (!empForm.name || !empForm.position) return
    addEmployee({ id: uid(), name: empForm.name!, position: empForm.position!, department: empForm.department ?? 'Digital Office', email: empForm.email ?? '' })
    setShowEmpForm(false)
    setEmpForm({})
  }

  const empMap = Object.fromEntries(employees.map(e => [e.id, e]))

  // Build leave calendar (current month + next)
  const months = [
    new Date().toISOString().slice(0, 7),
    new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 7),
  ]

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">HR / Табель</h1>
          <p className="text-slate-400 text-sm mt-1">{employees.length} сотрудников · {leaveRequests.filter(l => l.status === 'pending').length} заявок на согласовании</p>
        </div>
        <div className="flex gap-2">
          {tab === 'leaves' && <button onClick={() => setShowLeaveForm(!showLeaveForm)} className="btn-primary"><Plus size={16} />Заявка на отпуск</button>}
          {tab === 'employees' && <button onClick={() => setShowEmpForm(!showEmpForm)} className="btn-primary"><Plus size={16} />Сотрудник</button>}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-slate-100 p-1 rounded-xl w-fit">
        {([['leaves', 'Отпуска'], ['employees', 'Сотрудники']] as const).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} className={cn('px-4 py-1.5 rounded-lg text-sm font-medium transition-all', tab === key ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700')}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'leaves' && (
        <>
          {showLeaveForm && (
            <div className="card mb-6">
              <h2 className="font-semibold text-slate-700 mb-4">Новая заявка на отпуск</h2>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Сотрудник *</label>
                  <select className="input" value={leaveForm.employeeId ?? ''} onChange={e => setLeaveForm(p => ({ ...p, employeeId: e.target.value }))}>
                    <option value="">Выберите сотрудника</option>
                    {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Тип</label>
                  <select className="input" value={leaveForm.type} onChange={e => setLeaveForm(p => ({ ...p, type: e.target.value as LeaveRequest['type'] }))}>
                    <option value="vacation">Ежегодный отпуск</option>
                    <option value="sick">Больничный</option>
                    <option value="unpaid">Без содержания</option>
                    <option value="business">Командировка</option>
                  </select>
                </div>
                <div>
                  <label className="label">Дата начала *</label>
                  <input type="date" className="input" value={leaveForm.startDate ?? ''} onChange={e => setLeaveForm(p => ({ ...p, startDate: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Дата окончания *</label>
                  <input type="date" className="input" value={leaveForm.endDate ?? ''} onChange={e => setLeaveForm(p => ({ ...p, endDate: e.target.value }))} />
                </div>
                <div className="col-span-2">
                  <label className="label">Причина / комментарий</label>
                  <input className="input" placeholder="Ежегодный оплачиваемый отпуск" value={leaveForm.reason ?? ''} onChange={e => setLeaveForm(p => ({ ...p, reason: e.target.value }))} />
                </div>
              </div>
              <div className="flex gap-2 mt-4">
                <button onClick={saveLeave} className="btn-primary">Создать</button>
                <button onClick={() => setShowLeaveForm(false)} className="btn-ghost">Отмена</button>
              </div>
            </div>
          )}

          {/* Leave calendar overview */}
          <div className="grid grid-cols-1 gap-4 mb-6">
            {months.map(month => {
              const monthLeaves = leaveRequests.filter(l => l.startDate.startsWith(month) || l.endDate.startsWith(month))
              if (monthLeaves.length === 0) return null
              const [y, m] = month.split('-')
              const monthLabel = new Date(Number(y), Number(m) - 1).toLocaleDateString('ru-KZ', { month: 'long', year: 'numeric' })
              return (
                <div key={month} className="card">
                  <h3 className="text-sm font-semibold text-slate-600 mb-3 capitalize">{monthLabel}</h3>
                  <div className="space-y-2">
                    {monthLeaves.map(lr => {
                      const emp = empMap[lr.employeeId]
                      return (
                        <div key={lr.id} className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-slate-700">{emp?.name ?? 'Неизвестно'}</span>
                            <span className={LEAVE_TYPE_BADGE[lr.type]}>{LEAVE_TYPE_LABEL[lr.type]}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-xs text-slate-400">{formatDate(lr.startDate)} — {formatDate(lr.endDate)} ({lr.days} дн.)</span>
                            <span className={STATUS_BADGE[lr.status]}>{STATUS_LABEL[lr.status]}</span>
                            <select value={lr.status} onChange={e => updateLeaveRequest(lr.id, { status: e.target.value as LeaveRequest['status'] })}
                              className="text-xs border border-slate-200 rounded-lg px-2 py-1 text-slate-600 bg-white focus:outline-none">
                              <option value="pending">На согласовании</option>
                              <option value="in_progress">Согласовано</option>
                              <option value="done">Утверждено</option>
                              <option value="cancelled">Отклонено</option>
                            </select>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
            {leaveRequests.length === 0 && <p className="text-slate-400 text-sm py-4">Заявок на отпуск нет</p>}
          </div>

          {/* All leaves table */}
          <div className="card">
            <h3 className="font-semibold text-slate-700 mb-4">Все заявки</h3>
            <div className="space-y-2">
              {[...leaveRequests].reverse().map(lr => {
                const emp = empMap[lr.employeeId]
                return (
                  <div key={lr.id} className="flex items-center justify-between p-2 rounded-xl hover:bg-slate-50">
                    <div>
                      <span className="text-sm font-medium text-slate-700">{emp?.name}</span>
                      <span className={cn('ml-2', LEAVE_TYPE_BADGE[lr.type])}>{LEAVE_TYPE_LABEL[lr.type]}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-slate-400">
                      <span>{formatDate(lr.startDate)} — {formatDate(lr.endDate)}</span>
                      <span className="font-medium text-slate-600">{lr.days} дн.</span>
                      <select value={lr.status} onChange={e => updateLeaveRequest(lr.id, { status: e.target.value as LeaveRequest['status'] })}
                        className="text-xs border border-slate-200 rounded-lg px-2 py-1 text-slate-600 bg-white focus:outline-none">
                        <option value="pending">На согласовании</option>
                        <option value="in_progress">Согласовано</option>
                        <option value="done">Утверждено</option>
                        <option value="cancelled">Отклонено</option>
                      </select>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )}

      {tab === 'employees' && (
        <>
          {showEmpForm && (
            <div className="card mb-6">
              <h2 className="font-semibold text-slate-700 mb-4">Добавить сотрудника</h2>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">ФИО *</label><input className="input" value={empForm.name ?? ''} onChange={e => setEmpForm(p => ({ ...p, name: e.target.value }))} /></div>
                <div><label className="label">Должность *</label><input className="input" value={empForm.position ?? ''} onChange={e => setEmpForm(p => ({ ...p, position: e.target.value }))} /></div>
                <div><label className="label">Отдел</label><input className="input" value={empForm.department ?? ''} onChange={e => setEmpForm(p => ({ ...p, department: e.target.value }))} /></div>
                <div><label className="label">Email</label><input className="input" type="email" value={empForm.email ?? ''} onChange={e => setEmpForm(p => ({ ...p, email: e.target.value }))} /></div>
              </div>
              <div className="flex gap-2 mt-4">
                <button onClick={saveEmployee} className="btn-primary">Добавить</button>
                <button onClick={() => setShowEmpForm(false)} className="btn-ghost">Отмена</button>
              </div>
            </div>
          )}

          <div className="card">
            <div className="space-y-2">
              {employees.map(emp => {
                const empLeaves = leaveRequests.filter(l => l.employeeId === emp.id && (l.status === 'in_progress' || l.status === 'done'))
                const totalLeaveDays = empLeaves.reduce((s, l) => s + l.days, 0)
                return (
                  <div key={emp.id} className="flex items-center justify-between p-3 rounded-xl hover:bg-slate-50">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{emp.name}</p>
                      <p className="text-xs text-slate-400">{emp.position} · {emp.department}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-slate-400">{emp.email}</p>
                      <p className="text-xs text-slate-500 mt-0.5">Отпуск использовано: <span className="font-medium">{totalLeaveDays} дн.</span></p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
