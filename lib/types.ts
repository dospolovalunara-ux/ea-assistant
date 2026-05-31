export type Priority = 'low' | 'medium' | 'high' | 'urgent'
export type Status = 'pending' | 'in_progress' | 'done' | 'cancelled'
export type TravelStatus = 'draft' | 'submitted' | 'approved' | 'closed'

export interface Meeting {
  id: string
  title: string
  date: string
  time: string
  duration: number // minutes
  participants: string[]
  location: string
  agenda: string
  decisions: string
  actionItems: ActionItem[]
  type: 'board' | 'internal' | 'external' | 'training'
}

export interface ActionItem {
  id: string
  text: string
  assignee: string
  dueDate: string
  done: boolean
}

export interface Task {
  id: string
  title: string
  description: string
  priority: Priority
  status: Status
  dueDate: string
  createdAt: string
  completedAt?: string
  source: 'executive' | 'self'
  tags: string[]
}

export interface Employee {
  id: string
  name: string
  position: string
  department: string
  email: string
}

export interface TimesheetEntry {
  id: string
  employeeId: string
  month: string // YYYY-MM
  workDays: number
  absentDays: number
  vacationDays: number
  sickDays: number
  overtimeHours: number
  notes: string
}

export interface LeaveRequest {
  id: string
  employeeId: string
  type: 'vacation' | 'sick' | 'unpaid' | 'business'
  startDate: string
  endDate: string
  days: number
  status: Status
  reason: string
  createdAt: string
}

export interface TravelRequest {
  id: string
  traveler: string
  travelerId: string
  travelerType: 'executive' | 'deputy' | 'employee'
  destination: string
  purpose: string
  departureDate: string
  returnDate: string
  days: number
  status: TravelStatus
  advanceAmount: number
  actualExpenses: number
  expenses: ExpenseItem[]
  createdAt: string
}

export interface ExpenseItem {
  id: string
  category: 'transport' | 'hotel' | 'meals' | 'other'
  description: string
  amount: number
  currency: string
  date: string
  hasReceipt: boolean
  travelRequestId?: string
}

export interface PersonalExpense {
  id: string
  description: string
  amount: number
  currency: string
  date: string
  category: string
  reimbursed: boolean
  reimbursedDate?: string
  notes: string
}

export interface TrainingSession {
  id: string
  title: string
  date: string
  time: string
  duration: number
  instructor: string
  participants: TrainingParticipant[]
  topic: string
  status: 'scheduled' | 'completed' | 'cancelled'
  notes: string
}

export interface TrainingParticipant {
  id: string
  name: string
  email: string
  phone: string
  attended: boolean
  registeredAt: string
}
