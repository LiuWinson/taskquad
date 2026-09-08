<script setup lang="ts">
import { ref, inject } from 'vue';
import type { QuadrantKey, Task } from '../types';
import { QUADRANTS } from '../types';
import type { TaskPayload } from '../api';
import { isoToLocalInput, localInputToIso, dateToLocalInput } from '../time';

const props = defineProps<{
  task: Task | null;
  defaultQuadrant: QuadrantKey;
}>();

const emit = defineEmits<{
  close: [];
  save: [payload: TaskPayload];
  delete: [id: string];
}>();

const notify = inject<(message: string) => void>('notify', () => {});

const isEdit = props.task !== null;

const title = ref(props.task?.title ?? '');
const note = ref(props.task?.note ?? '');
const quadrant = ref<QuadrantKey>(props.task?.quadrant ?? props.defaultQuadrant);
const dueAtLocal = ref(isoToLocalInput(props.task?.dueAt ?? null));
const remindAtLocal = ref(isoToLocalInput(props.task?.remindAt ?? null));

const QUICK_REMINDS = [
  { label: '截止前 5 分钟', ms: 5 * 60 * 1000 },
  { label: '截止前 15 分钟', ms: 15 * 60 * 1000 },
  { label: '截止前 1 小时', ms: 60 * 60 * 1000 },
  { label: '截止前 1 天', ms: 24 * 60 * 60 * 1000 },
];

function applyQuick(ms: number) {
  if (!dueAtLocal.value) return;
  const due = new Date(dueAtLocal.value);
  if (Number.isNaN(due.getTime())) return;
  remindAtLocal.value = dateToLocalInput(new Date(due.getTime() - ms));
}

function save() {
  const trimmed = title.value.trim();
  if (!trimmed) {
    notify('标题不能为空');
    return;
  }
  emit('save', {
    title: trimmed,
    note: note.value,
    quadrant: quadrant.value,
    dueAt: localInputToIso(dueAtLocal.value),
    remindAt: localInputToIso(remindAtLocal.value),
  });
}
</script>

<template>
  <div class="modal-overlay" @click.self="emit('close')">
    <div class="modal">
      <div class="modal-head">
        <h2 class="modal-title">{{ isEdit ? '编辑任务' : '新建任务' }}</h2>
        <button class="modal-close" @click="emit('close')">×</button>
      </div>

      <div class="form">
        <div class="field">
          <label class="field-label" for="task-title"
            >标题<span class="req">*</span></label
          >
          <input
            id="task-title"
            v-model="title"
            class="input"
            type="text"
            placeholder="请输入任务标题"
            autofocus
          />
        </div>

        <div class="field">
          <label class="field-label" for="task-note">备注</label>
          <textarea
            id="task-note"
            v-model="note"
            class="textarea"
            placeholder="可选，补充说明"
          ></textarea>
        </div>

        <div class="field">
          <span class="field-label">四象限</span>
          <div class="quadrant-picker">
            <label
              v-for="q in QUADRANTS"
              :key="q.key"
              class="quad-option"
              :class="{ selected: quadrant === q.key }"
              :style="{
                '--q-color': q.color,
                borderColor: quadrant === q.key ? q.color : undefined,
              }"
            >
              <input
                type="radio"
                name="quadrant"
                :value="q.key"
                v-model="quadrant"
              />
              <span class="quad-dot" :style="{ background: q.color }"></span>
              {{ q.label }}
            </label>
          </div>
        </div>

        <div class="field">
          <label class="field-label" for="task-due">需要完成时间</label>
          <input
            id="task-due"
            v-model="dueAtLocal"
            class="input"
            type="datetime-local"
          />
          <span class="field-hint">可留空</span>
        </div>

        <div class="field">
          <label class="field-label" for="task-remind">提醒时间</label>
          <input
            id="task-remind"
            v-model="remindAtLocal"
            class="input"
            type="datetime-local"
          />
          <div v-if="dueAtLocal" class="quick-btns">
            <button
              v-for="q in QUICK_REMINDS"
              :key="q.ms"
              class="quick-btn"
              type="button"
              @click="applyQuick(q.ms)"
            >
              {{ q.label }}
            </button>
          </div>
          <span class="field-hint">可留空；选择截止时间后可一键填充提醒</span>
        </div>
      </div>

      <div class="modal-foot">
        <button
          v-if="isEdit"
          class="btn btn-danger delete-left"
          @click="emit('delete', props.task!.id)"
        >
          删除
        </button>
        <button class="btn btn-ghost" @click="emit('close')">取消</button>
        <button class="btn btn-primary" @click="save">保存</button>
      </div>
    </div>
  </div>
</template>
