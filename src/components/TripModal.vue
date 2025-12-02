<script setup>
import { ref, watch, computed } from 'vue';

const props = defineProps({
  isOpen: Boolean,
  currentDay: Number,
  editData: Object,
  drafts: {
    type: Array,
    default: () => []
  }
});

const emit = defineEmits(['close', 'save', 'delete']);

const form = ref({
  period: 'morning',
  type: 'spot',
  title: '',
  sub: '',
  cost: 0,
  note: '',
  note: '',
  naver_map: ''
});

const selectedDraftId = ref('');

const isEditMode = computed(() => !!props.editData && !!props.editData.id);

const periodOptions = [
  { value: 'morning', label: '上午' },
  { value: 'afternoon', label: '下午' },
  { value: 'evening', label: '晚上' }
];

const typeOptions = [
  { value: 'food', label: '餐食' },
  { value: 'spot', label: '景點' },
  { value: 'cafe', label: '咖啡' },
  { value: 'stay', label: '住宿' },
  { value: 'shop', label: '購物' },
  { value: 'act', label: '體驗' },
  { value: 'transport', label: '交通' }
];

const resetForm = () => {
  form.value = {
    period: 'morning',
    type: 'spot',
    title: '',
    sub: '',
    cost: 0,
    note: '',
    note: '',
    naver_map: ''
  };
  selectedDraftId.value = '';
};

// Watch for editData changes to populate form
watch(() => props.editData, (newData) => {
  if (newData) {
    form.value = {
      period: newData.period || 'morning',
      type: newData.type || 'spot',
      title: newData.title || '',
      sub: newData.sub || '',
      cost: newData.cost || 0,
      note: newData.note || '',
      naver_map: newData.naver_map || ''
    };
    selectedDraftId.value = ''; // Reset draft selection if editing specific item
  } else {
    resetForm();
  }
}, { immediate: true });

// Watch for draft selection
watch(selectedDraftId, (newId) => {
  if (newId) {
    const draft = props.drafts.find(d => d.id === newId);
    if (draft) {
      form.value = {
        ...form.value, // Keep current period/state
        type: draft.type || 'spot',
        title: draft.title || '',
        sub: draft.sub || '',
        cost: draft.cost || 0,
        note: draft.note || '',
        naver_map: draft.naver_map || ''
      };
    }
  }
});

const handleSave = (target) => {
  // target: 'schedule' (is_draft: false) or 'collection' (is_draft: true)
  const isDraft = target === 'collection';
  
  const payload = {
    ...form.value,
    is_draft: isDraft
  };

  // Determine ID to update:
  // 1. If editing an existing item, use its ID.
  // 2. If loading from a draft (and not editing another item), use the draft's ID (to move it).
  let idToUpdate = props.editData?.id;
  if (!idToUpdate && selectedDraftId.value) {
    idToUpdate = selectedDraftId.value;
  }

  emit('save', { data: payload, id: idToUpdate });
  
  // Only reset if not in edit mode (parent will close modal, but good practice)
  // Actually parent closes modal, so reset happens on next open via watch(editData) -> null
};

const handleDelete = () => {
  if (confirm('確定要刪除此行程嗎？')) {
    emit('delete', props.editData.id);
  }
};
</script>

<template>
  <div v-if="isOpen" class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
    <div class="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 w-full max-w-md shadow-lg max-h-[90vh] overflow-y-auto relative">
      
      <!-- Close Button -->
      <button 
        @click="$emit('close')" 
        class="absolute top-5 right-5 text-gray-400 hover:text-white transition-colors z-10"
      >
        <i class="fa-solid fa-xmark fa-xl"></i>
      </button>

      <div class="mb-4 pr-8">
        <h3 class="text-xl font-bold text-white">
          {{ isEditMode ? '編輯行程' : `新增 Day ${currentDay} 行程` }}
        </h3>
      </div>

      <!-- Load from Collection (Only in Add Mode) -->
      <div v-if="!isEditMode && drafts.length > 0" class="mb-6 bg-gray-700/50 p-3 rounded-lg border border-gray-600">
        <label class="block text-teal-400 text-sm font-bold mb-2">
          <i class="fa-solid fa-folder-open mr-1"></i> 從收藏清單匯入
        </label>
        <select v-model="selectedDraftId" class="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-teal-500 text-sm">
          <option value="">-- 選擇收藏項目 --</option>
          <option v-for="draft in drafts" :key="draft.id" :value="draft.id">
            {{ draft.title }} ({{ draft.sub || '無描述' }})
          </option>
        </select>
      </div>
      
      <div class="space-y-4">
        <!-- Period Selection -->
        <div>
          <label class="block text-gray-400 text-sm mb-1">時段</label>
          <div class="flex gap-2">
            <button 
              v-for="opt in periodOptions" 
              :key="opt.value"
              @click="form.period = opt.value"
              class="flex-1 py-2 rounded-lg text-sm font-medium transition-colors border"
              :class="form.period === opt.value ? 'bg-teal-600 border-teal-500 text-white' : 'bg-gray-700 border-gray-600 text-gray-300 hover:bg-gray-600'"
            >
              {{ opt.label }}
            </button>
          </div>
        </div>

        <!-- Type Selection -->
        <div>
          <label class="block text-gray-400 text-sm mb-1">類型</label>
          <select v-model="form.type" class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-teal-500">
            <option v-for="opt in typeOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
          </select>
        </div>

        <!-- Title -->
        <div>
          <label class="block text-gray-400 text-sm mb-1">標題</label>
          <input v-model="form.title" type="text" class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-teal-500" placeholder="例如：咸德海邊">
        </div>

        <!-- Subtitle -->
        <div>
          <label class="block text-gray-400 text-sm mb-1">副標題 / 描述</label>
          <input v-model="form.sub" type="text" class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-teal-500" placeholder="例如：果凍海玩沙">
        </div>

        <!-- Cost -->
        <div>
          <label class="block text-gray-400 text-sm mb-1">費用 (KRW)</label>
          <input v-model.number="form.cost" type="number" class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-teal-500">
        </div>

        <!-- Note -->
        <div>
          <label class="block text-gray-400 text-sm mb-1">備註</label>
          <input v-model="form.note" type="text" class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-teal-500" placeholder="選填">
        </div>



        <!-- Naver Map -->
        <div>
          <label class="block text-gray-400 text-sm mb-1">
            <i class="fa-solid fa-map-location-dot mr-1"></i> NAVER連結
          </label>
          <textarea v-model="form.naver_map" rows="3" class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-teal-500" placeholder="請貼上 Naver Map 分享網址..."></textarea>
        </div>
      </div>

      <!-- Action Buttons -->
      <div class="flex flex-col gap-3 mt-8">
        <div class="flex gap-3">
            <button @click="handleSave('schedule')" class="flex-1 py-3 rounded-lg bg-teal-500 text-white hover:bg-teal-400 transition-colors font-bold shadow-[0_0_15px_rgba(45,212,191,0.3)] flex items-center justify-center">
                <i class="fa-solid fa-calendar-check mr-2"></i> 加入行程
            </button>
            <button @click="handleSave('collection')" class="flex-1 py-3 rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 transition-colors font-bold shadow-lg flex items-center justify-center">
                <i class="fa-solid fa-box-archive mr-2"></i> 放入收藏
            </button>
        </div>
        
        <div v-if="isEditMode" class="flex justify-center mt-2">
            <button @click="handleDelete" class="w-full py-2 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors text-sm flex items-center justify-center">
                <i class="fa-solid fa-trash mr-2"></i> 刪除此行程
            </button>
        </div>
      </div>
    </div>
  </div>
</template>
