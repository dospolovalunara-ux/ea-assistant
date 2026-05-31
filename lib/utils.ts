import { clsx, type ClassValue } from 'clsx'

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs)
}

export function uid() {
  return Math.random().toString(36).slice(2, 10)
}

export function formatDate(dateStr: string) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return d.toLocaleDateString('ru-KZ', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export function formatMoney(amount: number, currency = 'KZT') {
  return new Intl.NumberFormat('ru-KZ').format(amount) + ' ' + currency
}

export function daysUntil(dateStr: string) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(dateStr)
  target.setHours(0, 0, 0, 0)
  return Math.ceil((target.getTime() - today.getTime()) / 86400000)
}

export const PRIORITY_LABEL: Record<string, string> = {
  low: 'Низкий', medium: 'Средний', high: 'Высокий', urgent: 'Срочно'
}
export const STATUS_LABEL: Record<string, string> = {
  pending: 'Ожидает', in_progress: 'В работе', done: 'Выполнено', cancelled: 'Отменено'
}
export const TRAVEL_STATUS_LABEL: Record<string, string> = {
  draft: 'Черновик', submitted: 'На согласовании', approved: 'Утверждено', closed: 'Закрыто'
}
