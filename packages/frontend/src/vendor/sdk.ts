import { inject } from 'vue'
import type { DialogStore } from '../components/VDialogProvider.vue'

export { default as JsonEditor } from '../components/JsonEditor.vue'

export const useDialog = () => inject("dialogStore") as DialogStore

export * from '../api/exportApi'
