export const CORPORATE_CATEGORIES = {
  business_lunch: "Деловой обед",
  taxi: "Такси и транспорт",
  travel: "Командировка",
  hotel: "Гостиница",
  gifts: "Представительские подарки",
  office: "Канцелярия и офис",
  other: "Прочее",
} as const;

export const PAYMENT_METHODS = { corporate_card: "Корпоративная карта", cash: "Наличные (подотчёт)", transfer: "Безналичный перевод" } as const;

export const EXPENSE_DOC_TYPES = {
  fiscal_receipt: "Фискальный чек",
  qr_confirmation: "QR-подтверждение",
  sales_receipt: "Товарный чек",
  payment_confirmation: "Подтверждение оплаты",
  other: "Другой документ",
} as const;
export type ExpenseDocType = keyof typeof EXPENSE_DOC_TYPES;

/** Обязательный минимум для бухгалтерии (правила уточняются у бухгалтерии). */
export const REQUIRED_DOCS: ExpenseDocType[] = ["fiscal_receipt", "payment_confirmation"];

export const PERSONAL_CATEGORIES = {
  food: "Питание",
  transport: "Транспорт",
  household: "Хозяйство",
  children: "Дети",
  health: "Здоровье",
  gifts: "Подарки",
  other: "Прочее",
} as const;

export const TRANSFER_KINDS = { income: "Поступление / передача денег", refund: "Возврат остатка", adjustment: "Корректировка" } as const;
