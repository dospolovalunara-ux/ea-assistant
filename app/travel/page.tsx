'use client'
import { useState } from 'react'
import { useStore } from '@/lib/store'
import { uid, formatDate, formatMoney, cn, TRAVEL_STATUS_LABEL } from '@/lib/utils'
import type { TravelRequest, ExpenseItem } from '@/lib/types'
import { Plus, ChevronDown, ChevronUp, Trash2 } from 'lucide-react'

const STATUS_BADGE: Record<string, string> = { draft: 'badge-gray', submitted: 'badge-yellow', approved: 'badge-green', closed: 'badge-blue' }
const TRAVELER_LABEL: Record<string, string> = { executive: 'Руководитель', deputy: 'Заместитель (BTS D)', employee: 'Сотрудник' }
const TRAVELER_BADGE: Record<string, string> = { executive: 'badge-purple', deputy: 'badge-blue', employee: 'badge-gray' }

export default function TravelPage() {
  const { travelRequests, addTravelRequest, updateTravelRequest, employees } = useStore()
  const [open, setOpen] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<Partial<TravelRequest>>({ travelerType: 'employee', status: 'draft', expenses: [] })
  const [expForm, setExpForm] = useState<Record<string, Partial<ExpenseItem>>>({})

  const totalAdvances = travelRequests.reduce((s, t) => s + t.advanceAmount, 0)
  const totalActual = travelRequests.reduce((s, t) => s + t.actualExpenses, 0)
  const openTravels = travelRequests.filter(t => t.status === 'approved' || t.status === 'submitted')

  function save() {
    if (!form.traveler || !form.destination || !form.departureDate || !form.returnDate) return
    const dep = new Date(form.departureDate!)
    const ret = new Date(form.returnDate!)
    const days = Math.ceil((ret.getTime() - dep.getTime()) / 86400000) + 1
    const t: TravelRequest = {
      id: uid(), traveler: form.traveler!, travelerId: uid(),
      travelerType: form.travelerType as TravelRequest['travelerType'] ?? 'employee',
      destination: form.destination!, purpose: form.purpose ?? '',
      departureDate: form.departureDate!, returnDate: form.returnDate!, days,
      status: 'draft', advanceAmount: form.advanceAmount ?? 0, actualExpenses: 0,
      expenses: [], createdAt: new Date().toISOString().slice(0, 10),
    }
    addTravelRequest(t)
    setShowForm(false)
    setForm({ travelerType: 'employee', status: 'draft', expenses: [] })
  }

  function addExpense(travelId: string) {
    const ef = expForm[travelId]
    if (!ef?.description || !ef?.amount) return
    const travel = travelRequests.find(t => t.id === travelId)!
    const exp: ExpenseItem = {
      id: uid(), category: (ef.category as ExpenseItem['category']) ?? 'other',
      description: ef.description!, amount: Number(ef.amount), currency: 'KZT',
      date: ef.date ?? new Date().toISOString().slice(0, 10), hasReceipt: ef.hasReceipt ?? false,
    }
    const newExpenses = [...travel.expenses, exp]
    const actualExpenses = newExpenses.reduce((s, e) => s + e.amount, 0)
    updateTravelRequest(travelId, { expenses: newExpenses, actualExpenses })
    setExpForm(p => ({ ...p, [travelId]: {} }))
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Командировки</h1>
          <p className="text-slate-400 text-sm mt-1">{openTravels.length} активных · авансы: {formatMoney(totalAdvances)} · расходы: {formatMoney(totalActual)}</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary"><Plus size={16} />Новая командировка</button>
      </div>

      {showForm && (
        <div className="card mb-6">
          <h2 className="font-semibold text-slate-700 mb-4">Создать командировку</h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Командируемый *</label>
              <select className="input" value={form.travelerType} onChange={e => {
                const type = e.target.value as TravelRequest['travelerType']
                setForm(p => ({ ...p, travelerType: type, traveler: type === 'executive' ? 'Руководитель' : type === 'deputy' ? 'Заместитель (BTS D)' : '' }))
              }}>
                <option value="executive">Руководитель</option>
                <option value="deputy">Заместитель (BTS D)</option>
                <option value="employee">Сотрудник Digital Office</option>
              </select>
            </div>
            <div>
              <label className="label">ФИО {form.travelerType === 'employee' && '(выберите или введите)'}</label>
              {form.travelerType === 'employee' ? (
                <select className="input" value={form.traveler ?? ''} onChange={e => setForm(p => ({ ...p, traveler: e.target.value }))}>
                  <option value="">Выберите сотрудника</option>
                  {employees.map(emp => <option key={emp.id} value={emp.name}>{emp.name}</option>)}
                </select>
              ) : (
                <input className="input" value={form.traveler ?? ''} readOnly />
              )}
            </div>
            <div>
              <label className="label">Пункт назначения *</label>
              <input className="input" placeholder="Алматы" value={form.destination ?? ''} onChange={e => setForm(p => ({ ...p, destination: e.target.value }))} />
            </div>
            <div>
              <label className="label">Аванс (KZT)</label>
              <input type="number" className="input" placeholder="0" value={form.advanceAmount ?? ''} onChange={e => setForm(p => ({ ...p, advanceAmount: Number(e.target.value) }))} />
            </div>
            <div>
              <label className="label">Дата выезда *</label>
              <input type="date" className="input" value={form.departureDate ?? ''} onChange={e => setForm(p => ({ ...p, departureDate: e.target.value }))} />
            </div>
            <div>
              <label className="label">Дата возвращения *</label>
              <input type="date" className="input" value={form.returnDate ?? ''} onChange={e => setForm(p => ({ ...p, returnDate: e.target.value }))} />
            </div>
            <div className="col-span-2">
              <label className="label">Цель командировки</label>
              <input className="input" placeholder="Переговоры, конференция..." value={form.purpose ?? ''} onChange={e => setForm(p => ({ ...p, purpose: e.target.value }))} />
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button onClick={save} className="btn-primary">Создать</button>
            <button onClick={() => setShowForm(false)} className="btn-ghost">Отмена</button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {travelRequests.length === 0 && <p className="text-slate-400 text-sm py-8 text-center">Командировок нет</p>}
        {[...travelRequests].reverse().map(tr => (
          <div key={tr.id} className="card">
            <div className="flex items-start justify-between gap-3 cursor-pointer" onClick={() => setOpen(open === tr.id ? null : tr.id)}>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-slate-800 text-sm">{tr.traveler}</span>
                  <span className={TRAVELER_BADGE[tr.travelerType]}>{TRAVELER_LABEL[tr.travelerType]}</span>
                  <span className={STATUS_BADGE[tr.status]}>{TRAVEL_STATUS_LABEL[tr.status]}</span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">{tr.destination} · {formatDate(tr.departureDate)} — {formatDate(tr.returnDate)} ({tr.days} дн.)</p>
                {tr.purpose && <p className="text-xs text-slate-500 mt-0.5">{tr.purpose}</p>}
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <div className="text-right">
                  <div className="text-xs text-slate-400">Аванс</div>
                  <div className="text-sm font-semibold text-slate-700">{formatMoney(tr.advanceAmount)}</div>
                </div>
                {open === tr.id ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
              </div>
            </div>

            {open === tr.id && (
              <div className="mt-4 pt-4 border-t border-slate-100 space-y-4">
                <div className="flex items-center gap-2">
                  <label className="text-xs font-medium text-slate-500">Статус:</label>
                  <select value={tr.status} onChange={e => updateTravelRequest(tr.id, { status: e.target.value as TravelRequest['status'] })}
                    className="text-xs border border-slate-200 rounded-lg px-2 py-1 text-slate-600 bg-white focus:outline-none">
                    <option value="draft">Черновик</option>
                    <option value="submitted">На согласовании</option>
                    <option value="approved">Утверждено</option>
                    <option value="closed">Закрыто</option>
                  </select>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-medium text-slate-500">Расходы</p>
                    <div className="text-xs">
                      <span className="text-slate-400">Аванс: {formatMoney(tr.advanceAmount)} · </span>
                      <span className={cn('font-medium', tr.actualExpenses > tr.advanceAmount ? 'text-red-500' : 'text-emerald-600')}>
                        Факт: {formatMoney(tr.actualExpenses)}
                      </span>
                      {tr.actualExpenses > tr.advanceAmount && (
                        <span className="text-red-500"> (+{formatMoney(tr.actualExpenses - tr.advanceAmount)})</span>
                      )}
                    </div>
                  </div>
                  <div className="space-y-1 mb-3">
                    {tr.expenses.map(exp => (
                      <div key={exp.id} className="flex items-center justify-between text-xs p-2 bg-slate-50 rounded-lg">
                        <div>
                          <span className="font-medium">{exp.description}</span>
                          <span className="text-slate-400 ml-2">{exp.category}</span>
                          {exp.hasReceipt && <span className="badge badge-green ml-1">Чек</span>}
                        </div>
                        <span className="font-semibold">{formatMoney(exp.amount)}</span>
                      </div>
                    ))}
                    {tr.expenses.length === 0 && <p className="text-xs text-slate-400">Расходов нет</p>}
                  </div>

                  <div className="grid grid-cols-2 gap-2 p-3 bg-slate-50 rounded-xl">
                    <select className="input text-xs" value={expForm[tr.id]?.category ?? 'other'}
                      onChange={e => setExpForm(p => ({ ...p, [tr.id]: { ...p[tr.id], category: e.target.value as ExpenseItem['category'] } }))}>
                      <option value="transport">Транспорт</option>
                      <option value="hotel">Проживание</option>
                      <option value="meals">Питание</option>
                      <option value="other">Прочее</option>
                    </select>
                    <input type="date" className="input text-xs" value={expForm[tr.id]?.date ?? ''}
                      onChange={e => setExpForm(p => ({ ...p, [tr.id]: { ...p[tr.id], date: e.target.value } }))} />
                    <input className="input text-xs col-span-2" placeholder="Описание расхода"
                      value={expForm[tr.id]?.description ?? ''}
                      onChange={e => setExpForm(p => ({ ...p, [tr.id]: { ...p[tr.id], description: e.target.value } }))} />
                    <input type="number" className="input text-xs" placeholder="Сумма KZT"
                      value={expForm[tr.id]?.amount ?? ''}
                      onChange={e => setExpForm(p => ({ ...p, [tr.id]: { ...p[tr.id], amount: Number(e.target.value) } }))} />
                    <label className="flex items-center gap-2 text-xs text-slate-600 px-1">
                      <input type="checkbox" checked={expForm[tr.id]?.hasReceipt ?? false}
                        onChange={e => setExpForm(p => ({ ...p, [tr.id]: { ...p[tr.id], hasReceipt: e.target.checked } }))} />
                      Чек есть
                    </label>
                    <button onClick={() => addExpense(tr.id)} className="btn-primary text-xs col-span-2">Добавить расход</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
