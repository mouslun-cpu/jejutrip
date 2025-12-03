<script setup>
import { ref, computed, onMounted, watch, nextTick } from 'vue';
import { db } from './firebase';
import { collection, getDocs, addDoc, query, orderBy, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import Chart from 'chart.js/auto';
import TripModal from './components/TripModal.vue';

// --- 狀態變數 ---
const currentDayIndex = ref(0);
const isModalOpen = ref(false);
const currentEditItem = ref(null);
const trips = ref([]);
const personalExpenses = ref([]);
const loading = ref(true);
const isDataLoaded = ref(false);

// 圖表相關 refs
const pieChartRef = ref(null);
const barChartRef = ref(null);
let pieChartInstance = null;
let barChartInstance = null;

// --- 設定資料 ---
const chartCategories = [
  { key: 'stay', label: '住宿', color: '#c084fc' },
  { key: 'food', label: '餐食', color: '#fb923c' },
  { key: 'shop', label: '購物', color: '#4ade80' },
  { key: 'act', label: '體驗', color: '#f87171' },
  { key: 'spot', label: '景點', color: '#60a5fa' },
  { key: 'cafe', label: '咖啡', color: '#f472b6' },
  { key: 'transport', label: '交通', color: '#9ca3af' }
];

const owners = ['涵', '澤', '爸媽'];
const newExpense = ref({ title: '', cost: '', category: 'shop', owner: '', day: 1 });

const periodConfig = [
  { key: 'morning', label: '上午', icon: 'fa-regular fa-sun' },
  { key: 'afternoon', label: '下午', icon: 'fa-solid fa-mug-hot' },
  { key: 'evening', label: '晚上', icon: 'fa-regular fa-moon' }
];

const scheduleStructure = [
  { day: 1, location: "初見濟州&漫步果凍海" },
  { day: 2, location: "海底總動員&偶來探險" },
  { day: 3, location: "動物方程式&深入橘子園" },
  { day: 4, location: "速度與激情&夜市狂歡夜" },
  { day: 5, location: "最後採買&甜蜜返家" }
];

// --- 計算屬性 ---
const drafts = computed(() => trips.value.filter(t => t.is_draft === true));
const scheduleItems = computed(() => trips.value.filter(t => t.is_draft === false));

const schedule = computed(() => {
  return scheduleStructure.map((dayStruct) => {
    const dayItems = scheduleItems.value.filter(t => t.day === dayStruct.day);
    return { ...dayStruct, items: dayItems };
  });
});

const currentSchedule = computed(() => {
  if (!schedule.value || !schedule.value[currentDayIndex.value]) return {};
  return schedule.value[currentDayIndex.value];
});

const totalCost = computed(() => {
  return scheduleItems.value.reduce((total, item) => total + (Number(item.cost) || 0), 0);
});

const categoryCosts = computed(() => {
  const stats = { stay: 0, food: 0, spot: 0, shop: 0, act: 0, transport: 0, cafe: 0, other: 0 };
  scheduleItems.value.forEach(item => {
    const type = stats[item.type] !== undefined ? item.type : 'other';
    stats[type] += (Number(item.cost) || 0);
  });
  return stats;
});

const publicShare = computed(() => Number(totalCost.value) / 5);

const ownerStats = computed(() => {
  const stats = { '涵': 0, '澤': 0, '爸媽': 0 };
  personalExpenses.value.forEach(item => {
    if (stats[item.owner] !== undefined) {
      stats[item.owner] += (Number(item.cost) || 0);
    }
  });
  return stats;
});

const battleScores = computed(() => {
  return owners.map(owner => {
    const scoreKRW = Number(publicShare.value) + Number(ownerStats.value[owner]);
    const personalKRW = Number(ownerStats.value[owner]);
    return {
      owner,
      score: Math.round(scoreKRW * 0.024),
      personal: Math.round(personalKRW * 0.024)
    };
  });
});

const newExpenseTwd = computed(() => {
  if (!newExpense.value.cost) return 0;
  return Math.round(newExpense.value.cost * 0.024);
});

// --- Firebase 操作 ---
const fetchTrips = async () => {
  try {
    const q = query(collection(db, 'trips'), orderBy('day'), orderBy('period'), orderBy('sort_order', 'asc'));
    const querySnapshot = await getDocs(q);
    trips.value = querySnapshot.docs.map(doc => {
      const data = doc.data();
      return { 
        id: doc.id, 
        ...data,
        is_draft: data.is_draft ?? false,
        sort_order: data.sort_order ?? 0 
      };
    });
  } catch (e) {
    console.error("Error trips:", e);
  }
};

const fetchPersonalExpenses = async () => {
  try {
    const q = query(collection(db, 'personal_expenses'), orderBy('created_at', 'desc'));
    const querySnapshot = await getDocs(q);
    personalExpenses.value = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (e) {
    console.error("Error expenses:", e);
  }
};

// --- 圖表繪製核心邏輯 (視覺改版: 甜甜圈 + 橫條) ---
const renderCharts = async () => {
  if (!isDataLoaded.value) return;
  await nextTick(); 

  // 1. 繪製甜甜圈圖 (Doughnut Chart)
  if (pieChartRef.value) {
    if (pieChartInstance) pieChartInstance.destroy();
    
    const pieData = chartCategories.map(c => categoryCosts.value[c.key] || 0);
    
    pieChartInstance = new Chart(pieChartRef.value, {
      type: 'doughnut', // 改回甜甜圈
      data: {
        labels: chartCategories.map(c => c.label),
        datasets: [{
          data: pieData,
          backgroundColor: chartCategories.map(c => c.color),
          borderWidth: 0,
          hoverOffset: 10
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        devicePixelRatio: 1,
        cutout: '60%', // 中間挖空，看起來更有質感
        layout: { padding: 10 },
        plugins: { legend: { display: false } } // 保持圖文分離，這很重要
      }
    });
  }

  // 2. 繪製橫條圖 (Horizontal Bar Chart)
  if (barChartRef.value) {
    if (barChartInstance) barChartInstance.destroy();

    const labels = battleScores.value.map(s => s.owner);
    const data = battleScores.value.map(s => s.score);
    const bgColors = ['#2dd4bf', '#c084fc', '#fb923c'];

    barChartInstance = new Chart(barChartRef.value, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: '總消費 (NT$)',
          data: data,
          backgroundColor: bgColors,
          borderRadius: 6,
          barThickness: 25 // 稍微加粗一點
        }]
      },
      options: {
        indexAxis: 'y', // 關鍵：轉成橫向
        responsive: true,
        maintainAspectRatio: false,
        devicePixelRatio: 1,
        layout: { padding: 10 },
        scales: {
          x: { 
            // 橫向時，X軸是金額
            ticks: { color: '#9ca3af' },
            grid: { color: 'rgba(255,255,255,0.1)' } 
          },
          y: { 
            // 橫向時，Y軸是人名
            ticks: { color: 'white', font: { size: 14, weight: 'bold' } },
            grid: { display: false }
          }
        },
        plugins: { 
          legend: { display: false } 
        }
      }
    });
  }
};

// --- 初始化 ---
onMounted(async () => {
  loading.value = true;
  await Promise.all([fetchTrips(), fetchPersonalExpenses()]);
  loading.value = false;
  isDataLoaded.value = true;
  
  // 延遲渲染以確保手機版面穩定
  setTimeout(() => {
    renderCharts();
  }, 500);
});

// 監聽數據變化重繪
watch([categoryCosts, battleScores], () => {
  renderCharts();
}, { deep: true });


// --- 其他 UI 功能函數 ---
const switchDay = (index) => currentDayIndex.value = index;
const openModal = (item = null) => { currentEditItem.value = item ? { ...item } : null; isModalOpen.value = true; };
const closeModal = () => { isModalOpen.value = false; currentEditItem.value = null; };
const getItemsByPeriod = (dayIndex, period) => {
  if (!schedule.value[dayIndex]) return [];
  return schedule.value[dayIndex].items.filter(item => item.period === period).sort((a, b) => a.sort_order - b.sort_order);
};
const openMap = (link) => { if (link) window.open(link, '_blank'); };

// CRUD Operations (簡化版)
const handleSave = async ({ data, id }) => {
  try {
    if (!data.is_draft) data.day = scheduleStructure[currentDayIndex.value].day;
    if (id) {
      await updateDoc(doc(db, "trips", id), data);
      const idx = trips.value.findIndex(t => t.id === id);
      if (idx !== -1) trips.value[idx] = { ...trips.value[idx], ...data };
    } else {
      const newTrip = { ...data, sort_order: Date.now() };
      const docRef = await addDoc(collection(db, "trips"), newTrip);
      trips.value.push({ id: docRef.id, ...newTrip });
    }
    closeModal();
  } catch(e) { alert(e.message); }
};

const handleDelete = async (id) => {
  try { await deleteDoc(doc(db, "trips", id)); trips.value = trips.value.filter(t => t.id !== id); closeModal(); } catch(e) { alert(e.message); }
};

const moveItem = async (item, dir) => {
  // 簡易排序：直接交換順序並更新 DB
  const list = getItemsByPeriod(currentDayIndex.value, item.period);
  const idx = list.findIndex(t => t.id === item.id);
  if (idx === -1) return;
  const target = list[idx + dir];
  if (!target) return;

  const temp = item.sort_order;
  // 避免 sort_order 重複或無效，重新生成時間戳
  const base = Date.now();
  item.sort_order = target.sort_order || base;
  target.sort_order = temp || base + 1;

  // UI 立即更新 (Vue Reactivity)
  trips.value.sort((a, b) => a.sort_order - b.sort_order);

  try {
    await updateDoc(doc(db, "trips", item.id), { sort_order: item.sort_order });
    await updateDoc(doc(db, "trips", target.id), { sort_order: target.sort_order });
  } catch(e) { console.error(e); }
};

const addPersonalExpense = async () => {
  if(!newExpense.value.title || !newExpense.value.cost) return alert("請填寫完整");
  const payload = { ...newExpense.value, cost: Number(newExpense.value.cost), created_at: Date.now() };
  const ref = await addDoc(collection(db, 'personal_expenses'), payload);
  personalExpenses.value.unshift({ id: ref.id, ...payload });
  newExpense.value = { title: '', cost: '', category: 'shop', owner: '', day: 1 };
};

const deletePersonalExpense = async (id) => {
  if(confirm("刪除?")) { await deleteDoc(doc(db, 'personal_expenses', id)); personalExpenses.value = personalExpenses.value.filter(i => i.id !== id); }
};

// 樣式 Helper
const getTypeLabel = (type) => ({ food: '餐食', spot: '景點', cafe: '咖啡', stay: '住宿', shop: '購物', act: '體驗', transport: '交通' }[type] || '其他');
const getTypeColor = (type, target) => {
  const map = {
    food: { bg: 'bg-orange-500', badge: 'bg-orange-500/20 text-orange-200' },
    spot: { bg: 'bg-blue-500', badge: 'bg-blue-500/20 text-blue-200' },
    cafe: { bg: 'bg-pink-500', badge: 'bg-pink-500/20 text-pink-200' },
    stay: { bg: 'bg-purple-500', badge: 'bg-purple-500/20 text-purple-200' },
    shop: { bg: 'bg-green-500', badge: 'bg-green-500/20 text-green-200' },
    act: { bg: 'bg-red-500', badge: 'bg-red-500/20 text-red-200' },
    transport: { bg: 'bg-gray-500', badge: 'bg-gray-500/20 text-gray-300' }
  };
  return map[type]?.[target] || '';
};
</script>

<template>
  <div class="bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-gray-800 via-gray-900 to-black text-slate-200 font-sans antialiased min-h-screen pb-24">
    <div class="max-w-md mx-auto min-h-screen relative">

      <header class="sticky top-0 z-40 bg-gray-900/80 backdrop-blur-md border-b border-white/10 pt-4 pb-2">
        <div class="px-4 mb-3 flex justify-between items-center">
          <div>
            <h1 class="text-3xl font-bold text-white">濟州島趴趴走</h1>
            <p class="text-xs text-slate-400 mt-1 font-mono">v4.0.3 | Dev by W.L</p>
          </div>
          <span class="text-xs bg-indigo-900 text-indigo-300 px-2 py-1 rounded-full border border-indigo-700">
            <i class="fa-solid fa-box-archive mr-1"></i> 收藏: {{ drafts.length }}
          </span>
        </div>
        
        <div class="flex overflow-x-auto no-scrollbar px-4 gap-3 pb-2">
          <button v-for="(day, index) in schedule" :key="index" @click="switchDay(index)"
            class="flex flex-col items-center justify-center min-w-[55px] h-[65px] rounded-2xl transition-all border border-transparent"
            :class="currentDayIndex === index ? 'bg-teal-500 text-white shadow-[0_0_15px_rgba(45,212,191,0.5)]' : 'bg-white/5 text-slate-400'">
            <span class="text-[10px] font-bold uppercase">Day</span>
            <span class="text-lg font-bold">{{ day.day }}</span>
          </button>
        </div>
        <div class="px-4 py-1 text-center bg-white/5 mx-4 mt-1 rounded-lg border border-white/10">
           <p class="text-sm text-gray-300"><i class="fa-solid fa-map-pin mr-1 text-teal-500"></i> {{ currentSchedule.location }}</p>
        </div>
      </header>

      <div class="p-4 space-y-8">
        <div v-if="loading" class="text-center py-10"><i class="fa-solid fa-circle-notch fa-spin text-2xl"></i></div>
        
        <div v-else v-for="period in periodConfig" :key="period.key">
          <h2 class="flex items-center text-2xl font-bold mb-4 ml-1">
            <i :class="[period.icon, 'mr-3 text-2xl text-teal-400 drop-shadow-md']"></i> 
            <span class="text-white">{{ period.label }}</span>
          </h2>
          
          <div class="space-y-3 ml-2 pl-2 border-l border-slate-700/50">
            <div v-for="item in getItemsByPeriod(currentDayIndex, period.key)" :key="item.id" 
                 class="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-4 flex gap-3 cursor-pointer hover:bg-white/10"
                 @click="openModal(item)">
                 
               <div class="flex flex-col items-center justify-center min-w-[40px]">
                 <button v-if="item.naver_map" @click.stop="openMap(item.naver_map)" class="w-10 h-10 rounded-full bg-teal-500/20 text-teal-400 flex items-center justify-center hover:bg-teal-500 hover:text-white transition-colors">
                   <i class="fa-solid fa-location-dot text-lg"></i>
                 </button>
                 <div v-else class="w-10 h-10 rounded-full bg-gray-700/50 flex items-center justify-center text-gray-500">
                   <i class="fa-solid fa-map-pin"></i>
                 </div>
               </div>

               <div class="flex-1 min-w-0">
                 <h3 class="font-bold text-lg text-white truncate">{{ item.title }}</h3>
                 <p class="text-sm text-gray-400 truncate">{{ item.sub }}</p>
                 <div class="mt-2 flex items-center gap-2">
                   <span class="text-[10px] px-2 py-0.5 rounded-full" :class="getTypeColor(item.type, 'badge')">{{ getTypeLabel(item.type) }}</span>
                   <span v-if="item.cost > 0" class="text-xs font-mono text-slate-400">₩{{ (item.cost/10000).toFixed(1) }}萬</span>
                 </div>
               </div>
               
               <div class="flex flex-col justify-center gap-1 border-l border-white/10 pl-2">
                  <i class="fa-solid fa-caret-up text-gray-600 hover:text-white p-1" @click.stop="moveItem(item, -1)"></i>
                  <i class="fa-solid fa-caret-down text-gray-600 hover:text-white p-1" @click.stop="moveItem(item, 1)"></i>
               </div>
            </div>
            
            <button @click="openModal()" class="w-full py-3 border border-dashed border-gray-700 rounded-xl text-gray-500 hover:text-teal-400 hover:border-teal-400 transition-colors">
              <i class="fa-solid fa-plus"></i> 新增{{ period.label }}行程
            </button>
          </div>
        </div>
      </div>

      <hr class="border-gray-800 mx-4 my-6">

      <div class="px-5 pb-10">
        <div class="flex items-center gap-3 mb-4">
          <i class="fa-solid fa-chart-pie text-2xl text-teal-400"></i>
          <h2 class="text-2xl font-bold text-white">公費統計</h2>
        </div>

        <div class="bg-gray-800 rounded-2xl p-4 border border-gray-700 shadow-lg">
          <div class="flex justify-between items-end mb-4 pb-4 border-b border-gray-700">
             <div><p class="text-xs text-gray-400">總預算 (KRW)</p><p class="text-xl font-bold font-mono text-white">₩ {{ totalCost.toLocaleString() }}</p></div>
             <div class="text-right"><p class="text-xs text-gray-400">約合台幣</p><p class="text-lg font-bold text-teal-400">NT$ {{ Math.round(totalCost * 0.024).toLocaleString() }}</p></div>
          </div>

          <div v-if="isDataLoaded" style="position: relative; height: 250px; width: 100%;">
            <canvas ref="pieChartRef"></canvas>
          </div>

          <div class="grid grid-cols-2 gap-2 mt-4">
            <div v-for="cat in chartCategories" :key="cat.key" class="flex items-center justify-between text-xs text-gray-300">
              <div class="flex items-center"><span class="w-3 h-3 rounded-full mr-2" :style="{ backgroundColor: cat.color }"></span>{{ cat.label }}</div>
              <span class="font-mono text-gray-500">₩{{ (Number(categoryCosts[cat.key]) || 0).toLocaleString() }}</span>
            </div>
          </div>
        </div>
      </div>

      <div class="px-5 pb-24">
        <div class="flex items-center gap-3 mb-6">
          <i class="fa-solid fa-trophy text-2xl text-teal-400"></i>
          <h2 class="text-2xl font-bold text-white">課金大賽</h2>
        </div>

        <div class="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-4 shadow-xl mb-8">
          <div v-if="isDataLoaded" style="position: relative; height: 300px; width: 100%;">
            <canvas ref="barChartRef"></canvas>
          </div>
          <p class="text-xs text-center text-gray-500 mt-2">* 包含公費均分 (NT${{ Math.round(publicShare * 0.024).toLocaleString() }}) + 個人私帳</p>
        </div>

        <div class="bg-white/5 border border-white/10 rounded-2xl p-5 mb-6">
           <h3 class="text-xl font-bold text-white mb-4"><i class="fa-solid fa-cart-shopping mr-2 text-teal-400"></i> 新增私帳</h3>
           <div class="space-y-3">
             <input v-model="newExpense.title" placeholder="品項名稱" class="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white text-sm">
             <div class="relative">
                <input v-model="newExpense.cost" type="number" placeholder="金額 (KRW)" class="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white text-sm">
                <span class="absolute right-3 top-2 text-xs text-teal-400">≈ NT$ {{ newExpenseTwd.toLocaleString() }}</span>
             </div>
             <div class="flex gap-2">
                <button v-for="owner in owners" :key="owner" @click="newExpense.owner = owner" 
                  class="flex-1 py-2 rounded border text-sm font-bold" 
                  :class="newExpense.owner === owner ? 'bg-teal-500 border-teal-400 text-white' : 'bg-gray-800 border-gray-700 text-gray-400'">{{ owner }}</button>
             </div>
             <div class="bg-gray-900/60 p-1 rounded-xl flex gap-1">
               <button 
                 v-for="d in 5" 
                 :key="d" 
                 @click="newExpense.day = d"
                 class="flex-1 py-1.5 rounded-lg text-xs font-bold transition-all duration-300"
                 :class="newExpense.day === d 
                   ? 'bg-teal-500 text-white shadow-[0_0_10px_rgba(45,212,191,0.4)]' 
                   : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'"
               >
                 D{{ d }}
               </button>
             </div>
             <button @click="addPersonalExpense" class="w-full bg-teal-600 text-white py-2 rounded font-bold">記錄</button>
           </div>
        </div>
        
        <div class="space-y-2">
           <div v-for="item in personalExpenses" :key="item.id" class="bg-white/5 border border-white/5 rounded-xl p-3 flex justify-between items-center">
              <div>
                 <span class="text-xs bg-gray-700 text-gray-300 px-1 rounded mr-2">{{ item.owner }}</span>
                 <span class="text-teal-400 text-xs mr-1">[D{{ item.day || 1 }}]</span>
                 <span class="text-white text-sm">{{ item.title }}</span>
              </div>
              <div class="flex items-center gap-3">
                 <span class="text-xs text-gray-400">NT${{ Math.round(item.cost * 0.024).toLocaleString() }}</span>
                 <button @click="deletePersonalExpense(item.id)" class="text-gray-600 hover:text-red-400"><i class="fa-solid fa-trash"></i></button>
              </div>
           </div>
        </div>
      </div>

      <TripModal :isOpen="isModalOpen" :currentDay="schedule[currentDayIndex].day" :editData="currentEditItem" :drafts="drafts" @close="closeModal" @save="handleSave" @delete="handleDelete" />
    </div>
  </div>
</template>