<template>
  <div class="v-table" :style="gridStyle">
    <div class="v-table__header">
      <div v-if="checkable" @click.stop="selectAllClick">
        <div class="v-checkbox__icon light" :class="{ active: checkedItems.size > 0 }">
          <VIcon v-if="checkedItems.size < data.length" icon="minus" />
          <VIcon v-else icon="check" />
        </div>
      </div>
      <div v-for="(col, i) in columns" :key="i">
        {{ col.title }}
      </div>
    </div>
    <component
      v-for="(item, index) in data"
      :key="itemKey ? (item as any)[itemKey] : index"
      :is="rowComponent ?? 'div'"
      v-bind="rowProps ? rowProps(item as T) : undefined"
      class="v-table__row"
      @click="$emit('itemclick', item)"
      @contextmenu="$emit('itemcontext', $event, item)"
    >
      <div v-if="checkable" @click.stop="checkItem(item)">
        <div class="v-checkbox__icon light" :class="{ active: checkedItems.has(item) }">
          <VIcon icon="check" />
        </div>
      </div>
      <template v-for="(col, i) in columns" :key="i">
        <div v-if="isFieldColumn(col)">{{ (item as any)[col.field] }}</div>
        <div v-else-if="isTemplateColumn(col)">{{ getTemplateRenderer(col.template)(item as any) }}</div>
        <div v-else-if="isActionColumn(col)" class="v-table__actions">
          <VButton flat @click.stop="col.onClick(itemKey ? (item as any)[itemKey] : item)">
            <VIcon v-if="col.icon" :icon="col.icon" />
            <span v-if="col.text">{{ col.text }}</span>
          </VButton>
        </div>
      </template>
    </component>
  </div>
</template>

<script lang="ts" setup generic="T">
import { type CSSProperties, computed, reactive, watch } from 'vue'
import { compileTemplate } from 'itomori'
import VIcon from './VIcon.vue'
import VButton from './VButton.vue'

const props = defineProps<{
  data: T[]
  columns: TableColumn<T>[]
  itemKey?: string
  rowComponent?: string
  rowProps?: (obj: T) => Record<string, any>
  checkable?: boolean
  checked?: T[]
}>()

const emit = defineEmits<{
  itemclick: [item: T]
  itemcontext: [event: MouseEvent, item: T]
  'update:checked': [items: T[]]
}>()

const isFieldColumn = (col: TableColumn<T>): col is FieldColumn<T> => 'field' in col
const isTemplateColumn = (col: TableColumn<T>): col is TemplateColumn<T> => 'template' in col
const isActionColumn = (col: TableColumn<T>): col is ActionColumn<T> => 'onClick' in col

const templateCache = new Map<string, (row: Record<string, unknown>) => string>()
const getTemplateRenderer = (template: string) => {
  if (!templateCache.has(template)) {
    templateCache.set(template, compileTemplate(template))
  }
  return templateCache.get(template)!
}

const gridStyle = computed<CSSProperties>(() => {
  const cols = props.columns.map(col =>
    typeof col.width === 'number' ? col.width + 'px' : (col.width ?? '1fr')
  )
  if (props.checkable) cols.unshift('40px')
  return { gridTemplateColumns: cols.join(' ') }
})

const checkedItems = reactive(new Set<any>())

const checkItem = (item: T) => {
  if (checkedItems.has(item)) {
    checkedItems.delete(item)
  } else {
    checkedItems.add(item)
  }
  emitChecked()
}

const selectAllClick = () => {
  if (checkedItems.size > 0) {
    checkedItems.clear()
  } else {
    for (const item of props.data) checkedItems.add(item)
  }
  emitChecked()
}

let cachedChecked: T[] = []
const emitChecked = () => {
  cachedChecked = props.data.filter(item => checkedItems.has(item))
  emit('update:checked', cachedChecked)
}

watch(() => props.checked, () => {
  if (!props.checked || props.checked === cachedChecked) return
  checkedItems.clear()
  for (const item of props.checked) checkedItems.add(item)
}, { immediate: true })
</script>

<script lang="ts">
interface ColumnBase {
  title: string
  width?: number | `${number}fr`
}

export type FieldColumn<T> = ColumnBase & {
  field: keyof T
}

export type TemplateColumn<T> = ColumnBase & {
  template: string
}

export type ActionColumn<T, KeyType = any> = ColumnBase & {
  icon?: string
  text?: string
  onClick: (itemId: KeyType) => Promise<void> | void
}

export type TableColumn<T, KeyType = any> = FieldColumn<T> | TemplateColumn<T> | ActionColumn<T, KeyType>
</script>

<style lang="sass">
.v-table
  display: grid

.v-table__header, .v-table__row
  display: grid
  grid-template-columns: subgrid
  grid-column: 1 / -1
  align-items: center

  & > div
    height: 100%
    display: flex
    align-items: center
    padding-left: 16px

.v-table__header
  font-size: 13px
  font-weight: 500
  color: var(--text-secondary-color)
  height: 40px
  box-sizing: border-box
  background-color: var(--paper-color)
  border-bottom: 1px solid var(--border-color)


.v-table__row
  height: 50px
  text-decoration: none
  color: var(--text-color)
  font-weight: 500
  text-align: left
  background: none
  border: none
  font-size: 14px
  border-bottom: 1px solid var(--border-color)
  padding: 0
  box-sizing: border-box

  &:last-child
    border-bottom: none

button.v-table__row, a.v-table__row
  cursor: pointer

  &:hover
    background-color: var(--hover-color)

a.v-table__row
  text-decoration: none

.v-table__row .v-table__actions
  padding: 0
  padding-right: 8px
  justify-content: flex-end
  gap: 8px
  display: none

.v-table__row:hover .v-table__actions
  display: flex
</style>
