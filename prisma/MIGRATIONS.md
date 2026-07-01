# Миграции Supabase (SQL Editor)

Каждый файл — **отдельная опция**. Выполняйте только на той базе, где нужна функция.  
На других проектах / staging **не запускайте** лишние скрипты.

| Файл | Обязательность | Что даёт |
|------|----------------|----------|
| `migrate-planning-and-balance.sql` | **Основа** (копилки, баланс, регулярные) | `monthlyContribution`, `balanceOffsets`, `confirmed`, … |
| `vehicle-tables.sql` | Устарело | Одна машина `HouseholdVehicle` — только legacy |
| `vehicle-garage-v2.sql` | **Опционально** | Гараж 2+ машин, `Vehicle`, `vehicleId` в операциях |

Приложение **не падает**, если опциональные таблицы отсутствуют: гараж скрыт, операции работают как раньше.

Проверка: `GET /api/status` — поля `planningColumnsOk`, `vehicleGarageTables`.
