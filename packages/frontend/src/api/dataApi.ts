import { request } from "./request";
import type { TableColumn } from '../components/VTable.vue'

type Page = {
  title: string,
  path: string,
}

export type FullPage = Page & {
  primaryKey: string,
  table: TableColumn<any>[]
  createForm: { schema: any }
  updateForm: { schema: any }
  component?: string,
  itemAccess: boolean,
  allowDelete?: boolean
}

export const dataApi = {
  getPages: () => request<Page[]>("/api/admin/pages"),
  getPageData: (pageId: string) => request<FullPage>(`/api/admin/pages/${pageId}`),
  getData: (pageId: string) => request(`/api/admin/data/${pageId}/items`),
  getItemData: (pageId: string, itemId: number) => request(`/api/admin/data/${pageId}/items/${itemId}`),

  createItem: (pageId: string, values: any) => request(`/api/admin/data/${pageId}/items`, values),
  updateItem: (pageId: string, itemId: any, values: any) => request(`/api/admin/data/${pageId}/items/${itemId}`, values),
  deleteItems: (pageId: string, itemIds: any) => request(`/api/admin/data/${pageId}/items`, { itemIds }, { method: "DELETE" })
}