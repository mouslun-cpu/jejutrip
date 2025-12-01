<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { db } from './firebase';
import { collection, getDocs, addDoc, query, orderBy, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import Chart from 'chart.js/auto';
import TripModal from './components/TripModal.vue';
import HelloWorld from './components/HelloWorld.vue';

const currentDayIndex = ref(0);
const chartInstance = ref(null);
const isModalOpen = ref(false);
const currentEditItem = ref(null); // Track item being edited
const trips = ref([]);
const loading = ref(true);

const periodConfig = [
  { key: 'morning', label: '上午', icon: '🌅' },
  { key: 'afternoon', label: '下午', icon: '☀️' },
  { key: 'evening', label: '晚上', icon: '🌙' }
];

const scheduleStructure = [
  { day: 1, location: "機場 → 咸德 → 西歸浦" },
  { day: 2, location: "西歸浦 ⇄ 東部往返" },
  { day: 3, location: "南部 → 西部 → 北部" },
  { day: 4, location: "濟州市 ⇄ 西部往返" },
  { day: 5, location: "甜蜜返家" }
];

// Computed: Drafts (Collection)
const drafts = computed(() => {
  return trips.value.filter(t => t.is_draft === true);
});

// Computed: Active Schedule Items
const scheduleItems = computed(() => {
  return trips.value.filter(t => t.is_draft === false);
});

const schedule = computed(() => {
  return scheduleStructure.map((dayStruct) => {
    const dayItems = scheduleItems.value.filter(t => t.day === dayStruct.day);
    return {
      ...dayStruct,
      items: dayItems
    };
  });
});

const currentSchedule = computed(() => {
  if (!schedule.value || !schedule.value[currentDayIndex.value]) return {};
  return schedule.value[currentDayIndex.value];
});

const totalCost = computed(() => {
  return scheduleItems.value.reduce((total, item) => total + (item.cost || 0), 0);
});

const categoryCosts = computed(() => {
  const stats = { stay: 0, food: 0, spot: 0, shop: 0, act: 0, transport: 0, cafe: 0, other: 0 };
  scheduleItems.value.forEach(item => {
    const type = stats[item.type] !== undefined ? item.type : 'other';
    stats[type] += (item.cost || 0);
  });
  return stats;
});

const fetchTrips = async () => {
  loading.value = true;
  console.log("Fetching trips...");
  try {
    const q = query(collection(db, 'trips'), orderBy('day'), orderBy('period'));
    const querySnapshot = await getDocs(q);
    
    trips.value = querySnapshot.docs.map(doc => {
      const data = doc.data();
      // Defensive Programming: Default values for missing fields
      return { 
        id: doc.id, 
        ...data,
        is_draft: data.is_draft !== undefined ? data.is_draft : false, // Default to false if missing
        naver_map: data.naver_map || '',
        day: data.day || 0,
        period: data.period || 'morning',
        type: data.type || 'spot',
        cost: data.cost || 0,
        title: data.title || '未命名',
        sub: data.sub || ''
      };
    });
    console.log("Trips fetched:", trips.value);
  } catch (e) {
    console.error("Error fetching trips: ", e);
    alert("讀取資料失敗: " + e.message);
  } finally {
    loading.value = false;
    // Use nextTick or slight delay to ensure DOM is ready for chart
    setTimeout(renderChart, 100);
  }
};

const handleSave = async ({ data, id }) => {
  try {
    // Ensure day is set if not a draft
    if (!data.is_draft) {
       data.day = scheduleStructure[currentDayIndex.value].day;
    } else {
       if (!data.day) data.day = scheduleStructure[currentDayIndex.value].day;
    }

    if (id) {
      // Update existing
      const docRef = doc(db, "trips", id);
      await updateDoc(docRef, data);
      
      const index = trips.value.findIndex(t => t.id === id);
      if (index !== -1) {
        trips.value[index] = { ...trips.value[index], ...data };
      }
    } else {
      // Create new
      const docRef = await addDoc(collection(db, "trips"), data);
      trips.value.push({ id: docRef.id, ...data });
    }

    closeModal();
    renderChart();
  } catch (e) {
    console.error("Error saving document: ", e);
    alert("儲存失敗: " + e.message);
  }
};

const handleDelete = async (id) => {
  try {
    await deleteDoc(doc(db, "trips", id));
    trips.value = trips.value.filter(t => t.id !== id);
    closeModal();
    renderChart();
  } catch (e) {
    console.error("Error deleting document: ", e);
    alert("刪除失敗: " + e.message);
  }
};

const openModal = (item = null) => {
  currentEditItem.value = item ? { ...item } : null;
  isModalOpen.value = true;
};

const closeModal = () => {
  isModalOpen.value = false;
  currentEditItem.value = null;
};

const switchDay = (index) => {
  currentDayIndex.value = index;
};

const getItemsByPeriod = (dayIndex, period) => {
  if (!schedule.value[dayIndex]) return [];
  return schedule.value[dayIndex].items.filter(item => item.period === period);
};

const getTypeColor = (type, target) => {
  const colors = {
    food: { 'border-l': 'border-l-orange-400', badge: 'bg-orange-500 text-orange-200' },
    spot: { 'border-l': 'border-l-blue-400', badge: 'bg-blue-500 text-blue-200' },
    cafe: { 'border-l': 'border-l-pink-400', badge: 'bg-pink-500 text-pink-200' },
    stay: { 'border-l': 'border-l-purple-400', badge: 'bg-purple-500 text-purple-200' },
    shop: { 'border-l': 'border-l-green-400', badge: 'bg-green-500 text-green-200' },
    act:  { 'border-l': 'border-l-red-400', badge: 'bg-red-500 text-red-200' },
    transport: { 'border-l': 'border-l-gray-400', badge: 'bg-gray-500 text-gray-300' }
  };
  return colors[type]?.[target] || '';
};

const getTypeLabel = (type) => {
  const labels = { food: '餐食', spot: '景點', cafe: '咖啡', stay: '住宿', shop: '購物', act: '體驗', transport: '交通' };
  return labels[type] || '其他';
};

const renderChart = () => {
  const ctx = document.getElementById('expenseChart');
  if (!ctx) {
    console.warn("Chart canvas not found");
    return;
  }

  const dataValues = [
    categoryCosts.value.stay, 
    categoryCosts.value.food, 
    categoryCosts.value.shop, 
    categoryCosts.value.act,
    categoryCosts.value.spot,
    categoryCosts.value.cafe,
    categoryCosts.value.transport
  ];
  
  const labels = ['住宿', '餐食', '購物', '體驗', '景點', '咖啡', '交通'];
  const bgColors = ['#c084fc', '#fb923c', '#4ade80', '#f87171', '#60a5fa', '#f472b6', '#9ca3af'];

  if (chartInstance.value) {
    chartInstance.value.destroy();
  }

  try {
    chartInstance.value = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: labels,
        datasets: [{
          data: dataValues,
          backgroundColor: bgColors,
          borderWidth: 0,
          hoverOffset: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '65%',
        plugins: {
          legend: {
            position: 'right',
            labels: { color: '#cbd5e1', font: { size: 12 }, boxWidth: 12 }
          }
        }
      }
    });
  } catch (e) {
    console.error("Error rendering chart:", e);
  }
};

onMounted(() => {
  console.log("App mounted");
  fetchTrips();
});

watch(categoryCosts, () => {
    renderChart();
});

</script>

<template>
  <div class="bg-gray-900 text-white font-sans antialiased min-h-screen pb-24">
    <div class="max-w-md mx-auto bg-gray-900 min-h-screen relative">

      <header class="sticky top-0 z-40 bg-gray-900/95 backdrop-blur-md border-b border-gray-800 pt-4 pb-2">
        <div class="px-4 mb-3 flex justify-between items-center">
          <div>
            <h1 class="text-xl font-bold bg-gradient-to-r from-teal-400 to-blue-500 bg-clip-text text-transparent">
              🌸 濟州島趴趴走
            </h1>
            <span class="text-xs font-mono text-gray-500">v3.0.1 (Fix)</span>
          </div>
          <div class="flex items-center gap-2">
             <span class="text-xs bg-indigo-900 text-indigo-300 px-2 py-1 rounded-full border border-indigo-700">
               <i class="fa-solid fa-box-archive mr-1"></i> 收藏: {{ drafts.length }}
             </span>
          </div>
        </div>

        <div class="flex overflow-x-auto no-scrollbar px-4 gap-3 pb-2">
          <button 
            v-for="(day, index) in schedule" 
            :key="index"
            @click="switchDay(index)"
            class="flex flex-col items-center justify-center min-w-[55px] h-[65px] rounded-xl transition-all duration-300 border border-transparent"
            :class="currentDayIndex === index ? 'bg-teal-600 border-teal-400 text-white shadow-lg' : 'bg-gray-800 text-gray-400 border-gray-700'"
          >
            <span class="text-[10px] font-bold uppercase tracking-wider">Day</span>
            <span class="text-lg font-bold">{{ day.day }}</span>
          </button>
        </div>
        
        <div class="px-4 py-1 text-center bg-gray-800/50 mx-4 mt-1 rounded-lg">
           <p class="text-sm text-gray-300">
            <i class="fa-solid fa-map-pin mr-1 text-teal-500"></i>
            {{ currentSchedule.location }}
          </p>
        </div>
      </header>

      <div class="p-4 space-y-8">
        <div v-if="loading" class="text-center text-gray-500 py-10">
            <i class="fa-solid fa-circle-notch fa-spin text-2xl mb-2"></i>
            <p>載入行程中...</p>
        </div>

        <div v-else v-for="period in periodConfig" :key="period.key">
          
          <h2 class="flex items-center text-lg font-bold text-gray-200 mb-3 ml-1">
            <span class="mr-2 text-xl">{{ period.icon }}</span> 
            {{ period.label }}
          </h2>

          <div class="space-y-3 relative border-l-2 border-gray-800 ml-3 pl-4 pb-2">
            
            <div 
              v-for="(item, idx) in getItemsByPeriod(currentDayIndex, period.key)" 
              :key="item.id"
              @click="openModal(item)"
              class="bg-gray-800 rounded-xl p-3 shadow-md border-l-4 relative group hover:bg-gray-750 transition-colors cursor-pointer active:scale-98 transform duration-100"
              :class="getTypeColor(item.type, 'border-l')"
            >
              <div class="flex justify-between items-start">
                <div>
                  <h3 class="font-bold text-base">{{ item.title }}</h3>
                  <p class="text-gray-400 text-sm mt-0.5">{{ item.sub }}</p>
                </div>
                <div v-if="item.cost > 0" class="text-right">
                   <span class="text-xs font-mono text-gray-400 block">₩{{ (item.cost/10000).toFixed(1) }}萬</span>
                </div>
              </div>

              <div class="mt-2 flex flex-wrap gap-2 items-center">
                <span class="text-[10px] px-2 py-0.5 rounded bg-opacity-20 text-opacity-90 font-medium tracking-wide" 
                      :class="getTypeColor(item.type, 'badge')">
                  {{ getTypeLabel(item.type) }}
                </span>
                <span v-if="item.note" class="text-xs text-gray-500 flex items-center">
                  <i class="fa-solid fa-note-sticky mr-1 opacity-70"></i> {{ item.note }}
                </span>
                
                <a v-if="item.naver_map && item.naver_map.startsWith('http')" :href="item.naver_map" target="_blank" @click.stop class="text-teal-400 hover:text-teal-300 transition-colors" title="開啟地圖">
                  <i class="fa-solid fa-map-location-dot text-lg"></i>
                </a>
                <button v-else-if="item.naver_map" @click.stop="alert(item.naver_map)" class="text-teal-400 hover:text-teal-300 transition-colors" title="查看地圖資訊">
                  <i class="fa-solid fa-map-location-dot text-lg"></i>
                </button>
              </div>
            </div>

            <button @click="openModal()" class="w-full py-2 border-2 border-dashed border-gray-700 rounded-xl text-gray-500 text-sm hover:border-teal-500 hover:text-teal-500 transition-colors flex items-center justify-center gap-2">
              <i class="fa-solid fa-plus"></i> 新增{{ period.label }}行程
            </button>
          </div>
        </div>
      </div>

      <hr class="border-gray-800 mx-4 my-6">

      <div class="px-5 pb-10">
        <h2 class="text-xl font-bold mb-4 flex items-center">
          <i class="fa-solid fa-chart-pie mr-2 text-teal-400"></i> 全旅程花費統計
        </h2>

        <div class="bg-gray-800 rounded-2xl p-4 flex justify-between items-center mb-6 shadow-lg border border-gray-700">
          <div>
            <p class="text-xs text-gray-400 mb-1">總預算 (KRW)</p>
            <p class="text-2xl font-bold font-mono text-white">₩ {{ totalCost.toLocaleString() }}</p>
          </div>
          <div class="text-right">
            <p class="text-xs text-gray-400 mb-1">約合台幣 (0.024)</p>
            <p class="text-xl font-bold text-teal-400">NT$ {{ Math.round(totalCost * 0.024).toLocaleString() }}</p>
          </div>
        </div>

        <div class="bg-gray-800 rounded-2xl p-4 border border-gray-700 shadow-lg">
          <div class="chart-container">
            <canvas id="expenseChart"></canvas>
          </div>
        </div>
      </div>

      <TripModal 
        :isOpen="isModalOpen" 
        :currentDay="schedule[currentDayIndex].day"
        :editData="currentEditItem"
        :drafts="drafts"
        @close="closeModal"
        @save="handleSave"
        @delete="handleDelete"
      />

    </div>
  </div>
</template>

<style scoped>
/* Scoped styles if needed, but mostly using Tailwind */
</style>
