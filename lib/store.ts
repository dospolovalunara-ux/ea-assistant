'use client'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type {
  Meeting, Task, Employee, TimesheetEntry, LeaveRequest,
  TravelRequest, ExpenseItem, PersonalExpense, TrainingSession
} from './types'

interface Store {
  meetings: Meeting[]
  tasks: Task[]
  employees: Employee[]
  timesheets: TimesheetEntry[]
  leaveRequests: LeaveRequest[]
  travelRequests: TravelRequest[]
  expenses: ExpenseItem[]
  personalExpenses: PersonalExpense[]
  trainings: TrainingSession[]

  addMeeting: (m: Meeting) => void
  updateMeeting: (id: string, m: Partial<Meeting>) => void
  deleteMeeting: (id: string) => void

  addTask: (t: Task) => void
  updateTask: (id: string, t: Partial<Task>) => void
  deleteTask: (id: string) => void

  addEmployee: (e: Employee) => void
  updateEmployee: (id: string, e: Partial<Employee>) => void

  addTimesheet: (t: TimesheetEntry) => void
  updateTimesheet: (id: string, t: Partial<TimesheetEntry>) => void

  addLeaveRequest: (l: LeaveRequest) => void
  updateLeaveRequest: (id: string, l: Partial<LeaveRequest>) => void

  addTravelRequest: (t: TravelRequest) => void
  updateTravelRequest: (id: string, t: Partial<TravelRequest>) => void

  addExpense: (e: ExpenseItem) => void
  addPersonalExpense: (e: PersonalExpense) => void
  updatePersonalExpense: (id: string, e: Partial<PersonalExpense>) => void

  addTraining: (t: TrainingSession) => void
  updateTraining: (id: string, t: Partial<TrainingSession>) => void
}

const seed = (): Partial<Store> => ({
  employees: [
    { id: 'e1', name: 'Айгерим Сейткали', position: 'Руководитель проектов', department: 'Digital Office', email: 'a.seitkali@kt.kz' },
    { id: 'e2', name: 'Данияр Нурланов', position: 'Разработчик', department: 'Digital Office', email: 'd.nurlanov@kt.kz' },
    { id: 'e3', name: 'Мадина Жаксыбекова', position: 'Аналитик', department: 'Digital Office', email: 'm.zhaksybekova@kt.kz' },
    { id: 'e4', name: 'Арман Сейтжанов', position: 'DevOps', department: 'Digital Office', email: 'a.seitzhanov@kt.kz' },
  ],
  tasks: [
    { id: 't1', title: 'Подготовить презентацию для совета директоров', description: 'Слайды по итогам Q2 2026', priority: 'urgent', status: 'in_progress', dueDate: '2026-06-05', createdAt: '2026-05-28', source: 'executive', tags: ['board', 'q2'] },
    { id: 't2', title: 'Организовать встречу с инвесторами', description: 'Подобрать слоты, разослать приглашения', priority: 'high', status: 'pending', dueDate: '2026-06-10', createdAt: '2026-05-30', source: 'executive', tags: ['investors'] },
    { id: 't3', title: 'Закрыть авансовый отчет за май', description: 'Собрать все чеки, заполнить форму', priority: 'high', status: 'pending', dueDate: '2026-06-03', createdAt: '2026-05-31', source: 'self', tags: ['finance'] },
    { id: 't4', title: 'Обновить график отпусков Digital Office', description: 'Внести июньские отпуска', priority: 'medium', status: 'pending', dueDate: '2026-06-07', createdAt: '2026-05-31', source: 'self', tags: ['hr'] },
  ],
  meetings: [
    {
      id: 'm1', title: 'Заседание совета директоров', date: '2026-06-03', time: '10:00', duration: 180,
      participants: ['Руководитель', 'Члены правления', 'CFO', 'CTO'],
      location: 'Зал заседаний A, 15 этаж', type: 'board',
      agenda: '1. Итоги Q2 2026\n2. Стратегические инициативы\n3. Утверждение бюджета H2',
      decisions: '', actionItems: []
    },
    {
      id: 'm2', title: 'Digital Office — еженедельный стендап', date: '2026-06-02', time: '09:00', duration: 30,
      participants: ['Команда Digital Office'],
      location: 'Zoom', type: 'internal',
      agenda: 'Статус задач, блокеры, планы на неделю',
      decisions: '', actionItems: []
    },
    {
      id: 'm3', title: 'Встреча с партнерами Huawei', date: '2026-06-05', time: '14:00', duration: 60,
      participants: ['Руководитель', 'CTO', 'Команда Huawei'],
      location: 'Переговорная B', type: 'external',
      agenda: 'Обсуждение партнерской программы 2026-2027',
      decisions: '', actionItems: []
    },
  ],
  travelRequests: [
    {
      id: 'tr1', traveler: 'Заместитель (BTS D)', travelerId: 'dep1', travelerType: 'deputy',
      destination: 'Алматы', purpose: 'Переговоры с партнерами',
      departureDate: '2026-06-08', returnDate: '2026-06-10', days: 3,
      status: 'approved', advanceAmount: 150000, actualExpenses: 0,
      expenses: [], createdAt: '2026-05-28'
    },
  ],
  trainings: [
    {
      id: 'tr_1', title: 'Вайбкодинг — Поток #4', date: '2026-06-07', time: '12:00', duration: 120,
      instructor: 'Инструктор', topic: 'Основы prompt engineering и no-code разработки',
      status: 'scheduled', notes: '',
      participants: [
        { id: 'p1', name: 'Алия Бекова', email: 'a.bekova@mail.kz', phone: '+77001112233', attended: false, registeredAt: '2026-05-25' },
        { id: 'p2', name: 'Нурлан Асанов', email: 'n.asanov@mail.kz', phone: '+77002223344', attended: false, registeredAt: '2026-05-26' },
        { id: 'p3', name: 'Гульнара Сатова', email: 'g.satova@mail.kz', phone: '+77003334455', attended: false, registeredAt: '2026-05-27' },
      ]
    }
  ],
  personalExpenses: [
    { id: 'pe1', description: 'Такси до аэропорта (руководитель)', amount: 12000, currency: 'KZT', date: '2026-05-20', category: 'Транспорт', reimbursed: false, notes: '' },
    { id: 'pe2', description: 'Деловой ужин с партнерами', amount: 45000, currency: 'KZT', date: '2026-05-22', category: 'Питание', reimbursed: false, notes: 'Ресторан Zafferano' },
  ],
  leaveRequests: [
    { id: 'lr1', employeeId: 'e1', type: 'vacation', startDate: '2026-06-16', endDate: '2026-06-30', days: 15, status: 'pending', reason: 'Ежегодный отпуск', createdAt: '2026-05-20' },
    { id: 'lr2', employeeId: 'e3', type: 'vacation', startDate: '2026-07-07', endDate: '2026-07-21', days: 15, status: 'pending', reason: 'Ежегодный отпуск', createdAt: '2026-05-25' },
  ],
})

export const useStore = create<Store>()(
  persist(
    (set) => ({
      meetings: [], tasks: [], employees: [], timesheets: [],
      leaveRequests: [], travelRequests: [], expenses: [],
      personalExpenses: [], trainings: [],
      ...seed(),

      addMeeting: (m) => set((s) => ({ meetings: [...s.meetings, m] })),
      updateMeeting: (id, m) => set((s) => ({ meetings: s.meetings.map(x => x.id === id ? { ...x, ...m } : x) })),
      deleteMeeting: (id) => set((s) => ({ meetings: s.meetings.filter(x => x.id !== id) })),

      addTask: (t) => set((s) => ({ tasks: [...s.tasks, t] })),
      updateTask: (id, t) => set((s) => ({ tasks: s.tasks.map(x => x.id === id ? { ...x, ...t } : x) })),
      deleteTask: (id) => set((s) => ({ tasks: s.tasks.filter(x => x.id !== id) })),

      addEmployee: (e) => set((s) => ({ employees: [...s.employees, e] })),
      updateEmployee: (id, e) => set((s) => ({ employees: s.employees.map(x => x.id === id ? { ...x, ...e } : x) })),

      addTimesheet: (t) => set((s) => ({ timesheets: [...s.timesheets, t] })),
      updateTimesheet: (id, t) => set((s) => ({ timesheets: s.timesheets.map(x => x.id === id ? { ...x, ...t } : x) })),

      addLeaveRequest: (l) => set((s) => ({ leaveRequests: [...s.leaveRequests, l] })),
      updateLeaveRequest: (id, l) => set((s) => ({ leaveRequests: s.leaveRequests.map(x => x.id === id ? { ...x, ...l } : x) })),

      addTravelRequest: (t) => set((s) => ({ travelRequests: [...s.travelRequests, t] })),
      updateTravelRequest: (id, t) => set((s) => ({ travelRequests: s.travelRequests.map(x => x.id === id ? { ...x, ...t } : x) })),

      addExpense: (e) => set((s) => ({ expenses: [...s.expenses, e] })),
      addPersonalExpense: (e) => set((s) => ({ personalExpenses: [...s.personalExpenses, e] })),
      updatePersonalExpense: (id, e) => set((s) => ({ personalExpenses: s.personalExpenses.map(x => x.id === id ? { ...x, ...e } : x) })),

      addTraining: (t) => set((s) => ({ trainings: [...s.trainings, t] })),
      updateTraining: (id, t) => set((s) => ({ trainings: s.trainings.map(x => x.id === id ? { ...x, ...t } : x) })),
    }),
    { name: 'ea-assistant-store' }
  )
)
