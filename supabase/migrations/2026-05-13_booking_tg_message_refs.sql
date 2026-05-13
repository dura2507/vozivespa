-- Track Telegram message IDs sent for each booking so the admin
-- panel can keep the chat in sync with status changes.
--
-- When a new booking lands we send one Telegram message per owner
-- chat id (today: Kristian + Thomas' partner). We save each
-- {chatId, messageId} pair on the booking row. Later, when the owner
-- confirms/declines/cancels via the admin panel, the API loads
-- these refs and edits the corresponding messages so all chats
-- reflect the new status — no more "still says pending" surprises.
--
-- Nullable + jsonb so old bookings keep working unchanged, and the
-- column is easy to inspect / append to.

alter table public.bookings
  add column if not exists telegram_message_refs jsonb;
