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
const personalExpenses = ref([]);
const loading = ref(true);
const battleChartInstance = ref(null);

const owners = ['涵', '澤', '爸媽'];
const newExpense = ref({
  title: '',
  cost: '',
  category: 'shop',
  owner: '',
  day: 1
});

const newExpenseTwd = computed(() => {
  if (!newExpense.value.cost) return 0;
  return Math.round(newExpense.value.cost * 0.024);
});

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

// Private Expense Computed
const publicShare = computed(() => {
  return totalCost.value / 5; // 5 adults
});

const ownerStats = computed(() => {
  const stats = { '涵': 0, '澤': 0, '爸媽': 0 };
  personalExpenses.value.forEach(item => {
    if (stats[item.owner] !== undefined) {
      stats[item.owner] += (item.cost || 0);
    }
  });
  return stats;
});

const battleScores = computed(() => {
  return owners.map(owner => {
    // Convert to TWD for the chart
    const scoreKRW = publicShare.value + ownerStats.value[owner];
    const personalKRW = ownerStats.value[owner];
    
    return {
      owner,
      score: Math.round(scoreKRW * 0.024),
      personal: Math.round(personalKRW * 0.024)
    };
  });
});

const fetchTrips = async () => {
  loading.value = true;
  console.log("Fetching trips...");
  try {
    const q = query(collection(db, 'trips'), orderBy('day'), orderBy('period'), orderBy('sort_order', 'asc'));
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
        sub: data.sub || '',
        sort_order: data.sort_order !== undefined ? data.sort_order : 0
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

const fetchPersonalExpenses = async () => {
  try {
    const q = query(collection(db, 'personal_expenses'), orderBy('created_at', 'desc'));
    const querySnapshot = await getDocs(q);
    personalExpenses.value = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    setTimeout(renderBattleChart, 100);
  } catch (e) {
    console.error("Error fetching personal expenses:", e);
  }
};

const addPersonalExpense = async () => {
  if (!newExpense.value.title || !newExpense.value.cost || !newExpense.value.owner || !newExpense.value.day) {
    alert("請填寫完整資訊 (名稱, 金額, 歸屬人, 天數)");
    return;
  }

  try {
    const payload = {
      ...newExpense.value,
      cost: Number(newExpense.value.cost),
      created_at: Date.now()
    };
    const docRef = await addDoc(collection(db, 'personal_expenses'), payload);
    personalExpenses.value.unshift({ id: docRef.id, ...payload });
    
    // Reset form
    newExpense.value = { title: '', cost: '', category: 'shop', owner: '', day: 1 };
    renderBattleChart();
  } catch (e) {
    console.error("Error adding personal expense:", e);
    alert("新增失敗");
  }
};

const deletePersonalExpense = async (id) => {
  if (!confirm("確定刪除此私帳？")) return;
  try {
    await deleteDoc(doc(db, 'personal_expenses', id));
    personalExpenses.value = personalExpenses.value.filter(item => item.id !== id);
    renderBattleChart();
  } catch (e) {
    console.error("Error deleting personal expense:", e);
    alert("刪除失敗");
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
      const newTrip = { ...data, sort_order: Date.now() };
      const docRef = await addDoc(collection(db, "trips"), newTrip);
      trips.value.push({ id: docRef.id, ...newTrip });
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

const moveItem = async (item, direction) => {
  // direction: -1 for up, 1 for down
  const currentList = getItemsByPeriod(currentDayIndex.value, item.period);
  const currentIndex = currentList.findIndex(t => t.id === item.id);
  
  if (currentIndex === -1) return;
  
  const targetIndex = currentIndex + direction;
  
  if (targetIndex < 0 || targetIndex >= currentList.length) return;
  
  const targetItem = currentList[targetIndex];
  
  // Swap sort_order
  // If sort_order is same or missing, we need to handle it. 
  // But for simplicity, let's assume we just swap their values. 
  // If they are equal (0), we might need to assign new values.
  
  let newSortOrder1 = targetItem.sort_order;
  let newSortOrder2 = item.sort_order;

  // Edge case: if both are 0 or same, we need to force a difference
  if (newSortOrder1 === newSortOrder2) {
      const base = Date.now();
      newSortOrder1 = base;
      newSortOrder2 = base + (direction * 100); // Make sure they are different
  }

  try {
      // Update local state first for responsiveness
      const itemInTrips = trips.value.find(t => t.id === item.id);
      const targetInTrips = trips.value.find(t => t.id === targetItem.id);
      
      if (itemInTrips && targetInTrips) {
          itemInTrips.sort_order = newSortOrder1;
          targetInTrips.sort_order = newSortOrder2;
          
          // Re-sort the trips array or just let the computed property handle it?
          // The computed 'scheduleItems' filters from 'trips'. 
          // 'trips' is not sorted by default in the ref, but 'getItemsByPeriod' relies on 'schedule' which relies on 'scheduleItems'.
          // We need to ensure 'scheduleItems' or 'trips' reflects the sort.
          // Actually, 'schedule' maps 'scheduleItems'. 'scheduleItems' is just a filter.
          // We should sort 'trips' or the result of 'getItemsByPeriod'.
          // Let's sort 'trips' value to ensure reactivity updates the UI order.
          trips.value.sort((a, b) => {
              if (a.day !== b.day) return a.day - b.day;
              if (a.period !== b.period) return 0; // Period sort is manual in UI loop
              return a.sort_order - b.sort_order;
          });
      }

      // Update Firestore
      await updateDoc(doc(db, "trips", item.id), { sort_order: newSortOrder1 });
      await updateDoc(doc(db, "trips", targetItem.id), { sort_order: newSortOrder2 });
      
  } catch (e) {
      console.error("Error moving item:", e);
      alert("移動失敗");
  }
};

const openMap = (item) => {
    if (!item.naver_map) return;
    
    if (item.naver_map.startsWith('http')) {
        window.open(item.naver_map, '_blank');
    } else {
        alert(item.naver_map);
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
  return schedule.value[dayIndex].items
    .filter(item => item.period === period)
    .sort((a, b) => a.sort_order - b.sort_order);
};

const getTypeColor = (type, target) => {
  const colors = {
    food: { 'border-l': 'border-l-orange-400', badge: 'bg-orange-500/20 text-orange-200 border border-orange-500/30', bg: 'bg-orange-500' },
    spot: { 'border-l': 'border-l-blue-400', badge: 'bg-blue-500/20 text-blue-200 border border-blue-500/30', bg: 'bg-blue-500' },
    cafe: { 'border-l': 'border-l-pink-400', badge: 'bg-pink-500/20 text-pink-200 border border-pink-500/30', bg: 'bg-pink-500' },
    stay: { 'border-l': 'border-l-purple-400', badge: 'bg-purple-500/20 text-purple-200 border border-purple-500/30', bg: 'bg-purple-500' },
    shop: { 'border-l': 'border-l-green-400', badge: 'bg-green-500/20 text-green-200 border border-green-500/30', bg: 'bg-green-500' },
    act:  { 'border-l': 'border-l-red-400', badge: 'bg-red-500/20 text-red-200 border border-red-500/30', bg: 'bg-red-500' },
    transport: { 'border-l': 'border-l-gray-400', badge: 'bg-gray-500/20 text-gray-300 border border-gray-500/30', bg: 'bg-gray-500' }
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

const renderBattleChart = () => {
  const ctx = document.getElementById('battleChart');
  if (!ctx) return;

  if (battleChartInstance.value) {
    battleChartInstance.value.destroy();
  }

  const labels = battleScores.value.map(s => s.owner);
  const data = battleScores.value.map(s => s.score);
  
  // Colors for 涵, 澤, 爸媽
  const bgColors = ['#2dd4bf', '#c084fc', '#fb923c']; 

  try {
    battleChartInstance.value = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: '總消費力 (NT$)',
          data: data,
          backgroundColor: bgColors,
          borderRadius: 5,
          barThickness: 20
        }]
      },
      options: {
        indexAxis: 'y', // Horizontal bar
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: function(context) {
                const score = context.raw;
                const owner = context.label;
                // Find personal score from battleScores
                const personData = battleScores.value.find(b => b.owner === owner);
                const personal = personData ? personData.personal : 0;
                return `總計: NT$${score.toLocaleString()} (私帳: NT$${personal.toLocaleString()})`;
              }
            }
          }
        },
        scales: {
          x: {
            grid: { color: 'rgba(255, 255, 255, 0.1)' },
            ticks: { color: '#94a3b8' }
          },
          y: {
            grid: { display: false },
            ticks: { color: '#e2e8f0', font: { size: 14, weight: 'bold' } }
          }
        }
      }
    });
  } catch (e) {
    console.error("Error rendering battle chart:", e);
  }
};

onMounted(() => {
  console.log("App mounted");
  fetchTrips();
  fetchPersonalExpenses();
});

watch(battleScores, () => {
  renderBattleChart();
});

watch(categoryCosts, () => {
    renderChart();
});

</script>

<template>
  <div class="bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-gray-800 via-gray-900 to-black text-slate-200 font-sans antialiased min-h-screen pb-24">
    <div class="max-w-md mx-auto min-h-screen relative">

      <header class="sticky top-0 z-40 bg-gray-900/80 backdrop-blur-md border-b border-white/10 pt-4 pb-2">
        <div class="px-4 mb-3 flex justify-between items-center">
          <div>
            <h1 class="text-xl font-bold bg-gradient-to-r from-teal-400 to-blue-500 bg-clip-text text-transparent">
              🌸 濟州島趴趴走
            </h1>
            <p class="text-xs text-slate-400 mt-1 font-mono">
              v4.0.1 <span class="mx-1 opacity-30">|</span> Dev by W.L
            </p>
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
            class="flex flex-col items-center justify-center min-w-[55px] h-[65px] rounded-2xl transition-all duration-300 border border-transparent"
            :class="currentDayIndex === index ? 'bg-teal-500 text-white shadow-[0_0_15px_rgba(45,212,191,0.5)]' : 'bg-white/5 text-slate-400 hover:bg-white/10'"
          >
            <span class="text-[10px] font-bold uppercase tracking-wider">Day</span>
            <span class="text-lg font-bold">{{ day.day }}</span>
          </button>
        </div>
        
        <div class="px-4 py-1 text-center bg-white/5 backdrop-blur-sm border border-white/5 mx-4 mt-1 rounded-lg">
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
          
          <h2 class="flex items-center text-xl font-bold mb-4 ml-1">
            <i :class="[period.icon, 'mr-3 text-xl text-teal-400 drop-shadow-md']"></i> 
            <span class="text-white tracking-wide">
              {{ period.label }}
            </span>
          </h2>

          <div class="space-y-3 relative border-l-2 border-slate-700/50 ml-4 pl-4 pb-2">
            
            <div 
              v-for="(item, idx) in getItemsByPeriod(currentDayIndex, period.key)" 
              :key="item.id"
              @click="openModal(item)"
              class="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl shadow-xl flex overflow-hidden cursor-pointer group transition-transform hover:scale-[1.01]"
            >
              <!-- 1. Left (Type Indicator) -->
              <div class="w-1.5 h-auto" :class="getTypeColor(item.type, 'bg').replace('/40', '')"></div>

              <!-- 2. Center (Content) -->
              <div class="flex-1 p-4 flex flex-col justify-center min-w-0">
                <!-- Row 1: Title + Map Icon -->
                <div class="flex items-center gap-2 mb-1">
                  <h3 class="font-bold text-lg text-white truncate">{{ item.title }}</h3>
                  <i v-if="item.naver_map" 
                     @click.stop="openMap(item)" 
                     class="fa-solid fa-location-dot text-teal-400 text-xl hover:scale-110 transition-transform hover:text-teal-300" 
                     title="開啟地圖">
                  </i>
                </div>

                <!-- Row 2: Subtitle -->
                <p class="text-sm text-gray-400 truncate mb-2">{{ item.sub }}</p>

                <!-- Row 3: Badge + Cost -->
                <div class="flex items-center gap-2">
                  <span class="text-[10px] px-2 py-0.5 rounded-full font-medium tracking-wide" 
                        :class="getTypeColor(item.type, 'badge')">
                    {{ getTypeLabel(item.type) }}
                  </span>
                  <span v-if="item.cost > 0" class="text-xs font-mono text-slate-400">
                     ₩{{ (item.cost/10000).toFixed(1) }}萬
                  </span>
                </div>
              </div>

              <!-- 3. Right (Actions) - Sort Only -->
              <div class="flex flex-col justify-center gap-2 border-l border-white/10 pl-2 pr-2 bg-white/5">
                  <button @click.stop="moveItem(item, -1)" class="text-teal-500 hover:text-teal-300 transition-colors p-1" title="上移">
                      <i class="fa-solid fa-caret-up fa-lg"></i>
                  </button>
                  <button @click.stop="moveItem(item, 1)" class="text-teal-500 hover:text-teal-300 transition-colors p-1" title="下移">
                      <i class="fa-solid fa-caret-down fa-lg"></i>
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
          <i class="fa-solid fa-chart-pie mr-2 text-teal-400"></i> 公費統計
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

      <!-- Private Expense Section -->
      <div class="px-5 pb-24">
        <div class="flex items-center gap-3 mb-6">
          <i class="fa-solid fa-trophy text-xl text-teal-400 drop-shadow-lg"></i>
          <h2 class="text-xl font-bold text-white tracking-wide">
            課金大賽
          </h2>
        </div>

        <!-- Battle Chart -->
        <div class="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-4 shadow-xl mb-8">
          <div class="h-[200px]">
            <canvas id="battleChart"></canvas>
          </div>
          <p class="text-xs text-center text-gray-500 mt-2">* 包含公費均分 (NT${{ Math.round(publicShare * 0.024).toLocaleString() }}) + 個人私帳</p>
        </div>

        <!-- Add Private Expense Form -->
        <div class="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-5 shadow-xl mb-6">
          <h3 class="text-xl font-bold text-white mb-4 flex items-center">
            <i class="fa-solid fa-cart-shopping mr-2 text-teal-400"></i> 新增私帳
          </h3>
          
          <div class="space-y-3">
            
            <!-- 1. Name -->
            <input v-model="newExpense.title" type="text" placeholder="品項名稱 (如: Olive Young)" class="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-teal-500 text-sm">
            
            <!-- 2. Cost + TWD Display -->
            <div class="relative">
                <input v-model="newExpense.cost" type="number" placeholder="金額 (KRW)" class="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-teal-500 text-sm">
                <div class="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-teal-400 font-mono">
                    ≈ NT$ {{ newExpenseTwd.toLocaleString() }}
                </div>
            </div>

            <!-- 3. Category (Reusing existing types logic if needed, but for now just text or simple select if we want) -->
            <!-- For simplicity, keeping it hidden or default as 'shop' as per request layout, but user asked for Category Select. 
                 Let's add a simple select reusing typeOptions from Modal logic? 
                 Or just hardcode common ones. Let's use a simple select. -->
            <select v-model="newExpense.category" class="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-teal-500 text-sm">
                <option value="shop">購物</option>
                <option value="food">餐食</option>
                <option value="cafe">咖啡</option>
                <option value="act">體驗</option>
                <option value="other">其他</option>
            </select>

            <!-- 4. Day Selector -->
            <div class="flex gap-2">
                <button 
                    v-for="d in 5" 
                    :key="d"
                    @click="newExpense.day = d"
                    class="flex-1 py-1.5 rounded-lg border transition-all text-xs font-bold"
                    :class="newExpense.day === d ? 'bg-teal-500 border-teal-400 text-white' : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-700'"
                >
                    D{{ d }}
                </button>
            </div>

            <!-- 5. Owner Selection -->
            <div class="flex gap-2">
              <button 
                v-for="owner in owners" 
                :key="owner"
                @click="newExpense.owner = owner"
                class="flex-1 py-2 rounded-lg border transition-all font-bold text-sm"
                :class="newExpense.owner === owner ? 'bg-teal-500 border-teal-400 text-white shadow-[0_0_10px_rgba(45,212,191,0.5)]' : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-700'"
              >
                {{ owner }}
              </button>
            </div>

            <!-- 6. Add Button -->
            <button @click="addPersonalExpense" class="w-full bg-teal-600 hover:bg-teal-500 text-white py-2 rounded-lg font-bold transition-colors flex items-center justify-center">
                <i class="fa-solid fa-plus mr-2"></i> 記錄私帳
            </button>
          </div>
        </div>

        <!-- Expense List -->
        <div class="space-y-2">
          <div v-for="item in personalExpenses" :key="item.id" class="bg-white/5 border border-white/5 rounded-xl p-3 flex justify-between items-center group">
            <div class="flex items-center gap-3">
              <span class="text-xs font-bold px-2 py-1 rounded bg-gray-700 text-gray-300 border border-gray-600">
                {{ item.owner }}
              </span>
              <div>
                <p class="text-white text-sm font-medium">
                    <span class="text-teal-400 font-mono text-xs mr-1">[D{{ item.day || 1 }}]</span>
                    {{ item.title }}
                </p>
                <p class="text-xs text-gray-500">
                    ₩{{ Number(item.cost).toLocaleString() }} 
                    <span class="text-gray-600 ml-1">(NT${{ Math.round(item.cost * 0.024).toLocaleString() }})</span>
                </p>
              </div>
            </div>
            <button @click="deletePersonalExpense(item.id)" class="text-gray-600 hover:text-red-400 transition-colors p-2 opacity-0 group-hover:opacity-100">
              <i class="fa-solid fa-trash"></i>
            </button>
          </div>
          <p v-if="personalExpenses.length === 0" class="text-center text-gray-600 text-sm py-4">目前沒有私帳記錄</p>
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
