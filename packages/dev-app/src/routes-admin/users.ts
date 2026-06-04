import { type AdminPanel } from "../../../backend/src/main";
import { schema } from 'compact-json-schema'
import { db } from "../plugins/db";

const createSchema = schema({
  description: { type: "string", multiline: true, label: "Био" },
  name: { type: "string", width: 0.5, label: "Имя" },
  lastName: { type: "string??", width: 0.5, label: "Фамилия" },
  password: { type: "string??", label: "Пароль", hidden: true },
})

export default (admin: AdminPanel, path: string) => admin.createPage({ title: "Пользователи", path })
  .data(async ({ take, skip }) => {
    return await db.users.findMany({ select: { id: true, name: true }, take, skip })
  }) 
  .primaryKey("id", "number")
  .item(async (id) => {
    return await db.users.findFirst({ where: { id } })
  })
  .table([
    { title: "ID", field: "id", width: 50 },
    { title: "Имя", field: "name" },
    { title: "Test", template: "{id} - {name}" }
  ])
  .createForm(createSchema, async (data) => {
    await db.users.create(data)
  })
  .updateForm(createSchema, async (itemId, data) => { 
    await db.users.update({ id: itemId }, data)
  })
  .onDelete(async (ids) => {
    await db.users.delete({ id: { in: ids }})
  })