'use client'
import { useState, useRef, useEffect } from 'react'
import { useStore } from '@/lib/store'
import { Send, Bot, User, Loader2, Sparkles } from 'lucide-react'

interface Message { role: 'user' | 'assistant'; content: string }

const QUICK_PROMPTS = [
  'Какие у меня срочные задачи?',
  'Что в расписании на эту неделю?',
  'Покажи командировки в работе',
  'Сколько к возврату по расходам?',
  'Какие заявки на отпуск ожидают?',
  'Подготовь повестку для встречи с советом директоров',
]

export default function ChatPage() {
  const store = useStore()
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: 'Здравствуйте! Я ваш AI-ассистент. Помогу с планированием, задачами, отчётами и координацией работы. Что нужно сделать?' }
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  function buildContext() {
    const today = new Date().toISOString().slice(0, 10)
    const urgentTasks = store.tasks.filter(t => t.status !== 'done' && t.priority === 'urgent')
    const pendingTasks = store.tasks.filter(t => t.status !== 'done' && t.status !== 'cancelled')
    const upcomingMeetings = store.meetings.filter(m => m.date >= today).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 5)
    const activeTravels = store.travelRequests.filter(t => t.status === 'approved' || t.status === 'submitted')
    const pendingLeaves = store.leaveRequests.filter(l => l.status === 'pending')
    const unreimbursed = store.personalExpenses.filter(e => !e.reimbursed)
    const unreimbursedTotal = unreimbursed.reduce((s, e) => s + e.amount, 0)
    const nextTraining = store.trainings.filter(t => t.date >= today && t.status === 'scheduled').sort((a, b) => a.date.localeCompare(b.date))[0]

    return `
Ты — персональный AI-ассистент Executive Assistant члена правления АО «Казахтелеком».
Сегодня: ${today}.
Отвечай по-русски, чётко и по делу. Если нет данных — скажи честно.

ТЕКУЩИЕ ДАННЫЕ:

СРОЧНЫЕ ЗАДАЧИ (${urgentTasks.length}):
${urgentTasks.map(t => `- ${t.title} | дедлайн: ${t.dueDate} | статус: ${t.status}`).join('\n') || 'Нет'}

ВСЕ АКТИВНЫЕ ЗАДАЧИ (${pendingTasks.length}):
${pendingTasks.map(t => `- [${t.priority}] ${t.title} | до: ${t.dueDate}`).join('\n') || 'Нет'}

БЛИЖАЙШИЕ ВСТРЕЧИ (${upcomingMeetings.length}):
${upcomingMeetings.map(m => `- ${m.date} ${m.time} | ${m.title} | ${m.type} | ${m.location}`).join('\n') || 'Нет'}

АКТИВНЫЕ КОМАНДИРОВКИ (${activeTravels.length}):
${activeTravels.map(t => `- ${t.traveler} → ${t.destination} | ${t.departureDate}—${t.returnDate} | аванс: ${t.advanceAmount} KZT`).join('\n') || 'Нет'}

ЗАЯВКИ НА ОТПУСК (${pendingLeaves.length} на согласовании):
${pendingLeaves.map(l => {
  const emp = store.employees.find(e => e.id === l.employeeId)
  return `- ${emp?.name ?? l.employeeId}: ${l.startDate}—${l.endDate} (${l.days} дн.)`
}).join('\n') || 'Нет'}

РАСХОДЫ К ВОЗВРАТУ: ${unreimbursedTotal.toLocaleString()} KZT (${unreimbursed.length} позиций)
${unreimbursed.map(e => `- ${e.description}: ${e.amount} ${e.currency} (${e.date})`).join('\n') || ''}

БЛИЖАЙШЕЕ ОБУЧЕНИЕ:
${nextTraining ? `${nextTraining.date} ${nextTraining.time} | ${nextTraining.title} | ${nextTraining.participants.length} участников` : 'Нет запланированных'}

СОТРУДНИКИ DIGITAL OFFICE (${store.employees.length}):
${store.employees.map(e => `- ${e.name} | ${e.position}`).join('\n')}
`
  }

  async function send(text?: string) {
    const msg = text ?? input.trim()
    if (!msg || loading) return
    setInput('')
    const userMsg: Message = { role: 'user', content: msg }
    setMessages(prev => [...prev, userMsg])
    setLoading(true)

    try {
      const context = buildContext()
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages, userMsg].map(m => ({ role: m.role, content: m.content })),
          systemPrompt: context,
        })
      })

      if (!res.ok) throw new Error('API error')
      const data = await res.json()
      setMessages(prev => [...prev, { role: 'assistant', content: data.content }])
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Извините, произошла ошибка. Проверьте настройки API ключа в файле .env.local (ANTHROPIC_API_KEY).' }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <div className="px-6 py-4 border-b border-slate-100 bg-white">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-brand-500 rounded-xl flex items-center justify-center">
            <Sparkles size={18} className="text-white" />
          </div>
          <div>
            <h1 className="font-bold text-slate-800">AI Ассистент</h1>
            <p className="text-xs text-slate-400">Доступ к данным всех модулей в реальном времени</p>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${msg.role === 'assistant' ? 'bg-brand-500' : 'bg-slate-200'}`}>
              {msg.role === 'assistant' ? <Bot size={16} className="text-white" /> : <User size={16} className="text-slate-600" />}
            </div>
            <div className={`max-w-2xl px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${msg.role === 'assistant' ? 'bg-white border border-slate-100 text-slate-700 shadow-sm' : 'bg-brand-500 text-white'}`}>
              {msg.content}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-xl bg-brand-500 flex items-center justify-center shrink-0">
              <Bot size={16} className="text-white" />
            </div>
            <div className="bg-white border border-slate-100 rounded-2xl px-4 py-3 shadow-sm">
              <Loader2 size={16} className="text-brand-500 animate-spin" />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Quick prompts */}
      <div className="px-6 py-2 flex gap-2 overflow-x-auto">
        {QUICK_PROMPTS.map(p => (
          <button key={p} onClick={() => send(p)}
            className="shrink-0 text-xs bg-brand-50 text-brand-600 px-3 py-1.5 rounded-xl hover:bg-brand-100 transition whitespace-nowrap">
            {p}
          </button>
        ))}
      </div>

      {/* Input */}
      <div className="px-6 py-4 border-t border-slate-100 bg-white">
        <div className="flex gap-3">
          <input
            className="input flex-1"
            placeholder="Задайте вопрос или дайте поручение..."
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
            disabled={loading}
          />
          <button onClick={() => send()} disabled={loading || !input.trim()} className="btn-primary px-4">
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  )
}
