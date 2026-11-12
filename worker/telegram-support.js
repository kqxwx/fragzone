const cors = { "content-type": "application/json; charset=utf-8" };

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "GET") return new Response("FRAGZONE Support bot is running");
    if (url.pathname !== "/telegram") return new Response("Not found", { status: 404 });
    if (request.headers.get("X-Telegram-Bot-Api-Secret-Token") !== env.WEBHOOK_SECRET) {
      return new Response("Unauthorized", { status: 401 });
    }
    const update = await request.json();
    const msg = update.message;
    if (!msg?.chat?.id || !msg.text) return Response.json({ ok: true });
    const chatId = String(msg.chat.id);
    const text = msg.text.trim();
    const adminId = String(env.ADMIN_CHAT_ID);
    const send = async (id, body) => fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: id, text: body })
    });
    const key = `state:${chatId}`;
    if (text === "/start") {
      await send(chatId, "👋 Добро пожаловать в поддержку FRAGZONE!\n\n/new — создать тикет\n/my — мои обращения\n/cancel — отменить создание тикета");
    } else if (text === "/new") {
      await env.TICKETS.put(key, "waiting");
      await send(chatId, "Опиши проблему одним сообщением. Я создам тикет и передам его поддержке.");
    } else if (text === "/cancel") {
      await env.TICKETS.delete(key);
      await send(chatId, "Создание тикета отменено.");
    } else if (text === "/my") {
      const ids = await env.TICKETS.get(`user-tickets:${chatId}`, "json") || [];
      await send(chatId, ids.length ? "Твои тикеты: " + ids.join(", ") : "У тебя пока нет тикетов.");
    } else if (chatId === adminId && text.startsWith("/reply ")) {
      const m = text.match(/^\/reply\s+(\d+)\s+([\s\S]+)/);
      if (!m) await send(chatId, "Формат: /reply НОМЕР текст ответа");
      else {
        const ticket = await env.TICKETS.get(`ticket:${m[1]}`, "json");
        if (!ticket) await send(chatId, "Тикет не найден.");
        else {
          await send(ticket.userId, `💬 Ответ поддержки по тикету #${m[1]}:\n\n${m[2]}`);
          await send(chatId, "Ответ отправлен.");
        }
      }
    } else if (chatId === adminId && text.startsWith("/close ")) {
      const id = text.split(/\s+/)[1];
      const ticket = await env.TICKETS.get(`ticket:${id}`, "json");
      if (!ticket) await send(chatId, "Тикет не найден.");
      else {
        ticket.status = "closed";
        await env.TICKETS.put(`ticket:${id}`, JSON.stringify(ticket));
        await send(ticket.userId, `Тикет #${id} закрыт. Если нужна помощь, создай новый через /new.`);
        await send(chatId, `Тикет #${id} закрыт.`);
      }
    } else if (await env.TICKETS.get(key) === "waiting") {
      const id = String(Date.now()).slice(-8);
      const ticket = { id, userId: chatId, username: msg.from?.username || "", text, status: "open", createdAt: new Date().toISOString() };
      await env.TICKETS.put(`ticket:${id}`, JSON.stringify(ticket));
      const ids = await env.TICKETS.get(`user-tickets:${chatId}`, "json") || [];
      ids.push(id);
      await env.TICKETS.put(`user-tickets:${chatId}`, JSON.stringify(ids));
      await env.TICKETS.delete(key);
      await send(chatId, `✅ Тикет #${id} создан. Поддержка скоро ответит здесь.\n\nЧтобы посмотреть обращения: /my`);
      await send(adminId, `🎫 Новый тикет #${id}\nОт: @${ticket.username || "без username"} (ID ${chatId})\n\n${text}\n\nОтвет: /reply ${id} текст\nЗакрыть: /close ${id}`);
    } else {
      await send(chatId, "Чтобы обратиться в поддержку, отправь /new.");
    }
    return Response.json({ ok: true });
  }
};