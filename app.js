import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { 
  getFirestore, 
  collection, 
  addDoc, 
  onSnapshot, 
  query, 
  orderBy, 
  limit, 
  doc, 
  updateDoc, 
  increment,
  getDocs
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { 
  getAuth, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut, 
  onAuthStateChanged 
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';

// ==========================================
// MOCK DATABASE & CUSTOM EVENT SYSTEM
// ==========================================
const MockEvents = {
  listeners: {},
  subscribe(event, callback) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);
    return () => {
      this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
    };
  },
  publish(event, data) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(callback => callback(data));
    }
  }
};

function initMockData() {
  if (!localStorage.getItem('moodbubble_posts')) {
    const defaultPosts = [
      {
        id: 'mock_post_1',
        nickname: 'CodingKitten',
        avatar: '🐱',
        mood: 'excited',
        emoji: '🥳',
        content: 'Just solved the bug that took me 3 hours! Life is good coding inside MoodBubble 🚀',
        timestamp: Date.now() - 7200000,
        reactions: { hugs: 5, same: 12, support: 18 }
      },
      {
        id: 'mock_post_2',
        nickname: 'StudyFrog',
        avatar: '🐸',
        mood: 'tired',
        emoji: '🥱',
        content: 'Calculating derivatives at 3 AM is not it. Send coffee please... 🥱☕',
        timestamp: Date.now() - 3600000,
        reactions: { hugs: 15, same: 9, support: 4 }
      }
    ];
    localStorage.setItem('moodbubble_posts', JSON.stringify(defaultPosts));
  }

  if (!localStorage.getItem('moodbubble_communities')) {
    const defaultCommunities = [
      {
        id: 'math_101',
        name: 'Math 101 Help',
        icon: '📐',
        description: 'Need help with calculus, geometry, or homework problems?',
        timestamp: Date.now() - 86400000,
        accessCode: ''
      },
      {
        id: 'coding_late',
        name: 'Late Night Studiers',
        icon: '☕',
        description: 'For the midnight oil burners, debugging code & sharing coffee vibes.',
        timestamp: Date.now() - 86400000,
        accessCode: ''
      },
      {
        id: 'exam_prep',
        name: 'Exam Prep Crew',
        icon: '📝',
        description: 'Share summaries, flashcards, and motivate each other before the tests!',
        timestamp: Date.now() - 86400000,
        accessCode: 'study123'
      }
    ];
    localStorage.setItem('moodbubble_communities', JSON.stringify(defaultCommunities));
  }

  // Prepopulate chats and tasks if not present
  if (!localStorage.getItem('moodbubble_chats_math_101')) {
    const defaultChats = [
      { id: 'm1', nickname: 'StudyFrog', avatar: '🐸', content: 'Anyone else struggling with limits homework?', timestamp: Date.now() - 1800000 },
      { id: 'm2', nickname: 'CodingKitten', avatar: '🐱', content: 'Yeah, problem 4 is super tricky. Let me share my notes!', timestamp: Date.now() - 1200000 }
    ];
    localStorage.setItem('moodbubble_chats_math_101', JSON.stringify(defaultChats));
  }

  if (!localStorage.getItem('moodbubble_tasks_math_101')) {
    const defaultTasks = [
      { id: 't1', title: 'Complete Chapter 2 Limits Exercises', type: '📚 Study', dueDate: new Date().toISOString().split('T')[0], completed: false, completedBy: null, timestamp: Date.now() - 3600000 },
      { id: 't2', title: 'Calculus Quiz Prep', type: '📝 Exam', dueDate: new Date(Date.now() + 86400000).toISOString().split('T')[0], completed: true, completedBy: 'CodingKitten', timestamp: Date.now() - 7200000 }
    ];
    localStorage.setItem('moodbubble_tasks_math_101', JSON.stringify(defaultTasks));
  }
}

// ==========================================
// UNIFIED DATA CONTROLLER INTERFACE
// ==========================================
const DB = {
  mode: 'mock',
  db: null,

  async addPost(postData) {
    if (this.mode === 'firebase') {
      await addDoc(collection(this.db, 'posts'), {
        ...postData,
        timestamp: Date.now(),
        reactions: { hugs: 0, same: 0, support: 0 }
      });
    } else {
      const posts = JSON.parse(localStorage.getItem('moodbubble_posts') || '[]');
      const newPost = {
        id: 'post_' + Math.random().toString(36).substr(2, 9),
        ...postData,
        timestamp: Date.now(),
        reactions: { hugs: 0, same: 0, support: 0 }
      };
      posts.push(newPost);
      localStorage.setItem('moodbubble_posts', JSON.stringify(posts));
      MockEvents.publish('posts_updated');
    }
  },

  listenPosts(callback) {
    if (this.mode === 'firebase') {
      const q = query(collection(this.db, 'posts'), orderBy('timestamp', 'desc'));
      return onSnapshot(q, (snapshot) => {
        const posts = [];
        snapshot.forEach(doc => {
          posts.push({ id: doc.id, ...doc.data() });
        });
        callback(posts);
      }, (err) => {
        console.error("Firestore onSnapshot error:", err);
      });
    } else {
      const fetchAndCallback = () => {
        const posts = JSON.parse(localStorage.getItem('moodbubble_posts') || '[]');
        posts.sort((a, b) => b.timestamp - a.timestamp);
        callback(posts);
      };
      fetchAndCallback();
      return MockEvents.subscribe('posts_updated', fetchAndCallback);
    }
  },

  async addReaction(postId, reactionType) {
    if (this.mode === 'firebase') {
      const ref = doc(this.db, 'posts', postId);
      const updates = {};
      updates[`reactions.${reactionType}`] = increment(1);
      await updateDoc(ref, updates);
    } else {
      const posts = JSON.parse(localStorage.getItem('moodbubble_posts') || '[]');
      const post = posts.find(p => p.id === postId);
      if (post) {
        if (!post.reactions) post.reactions = { hugs: 0, same: 0, support: 0 };
        post.reactions[reactionType] = (post.reactions[reactionType] || 0) + 1;
        localStorage.setItem('moodbubble_posts', JSON.stringify(posts));
        MockEvents.publish('posts_updated');
      }
    }
  },

  async addCommunity(commData) {
    if (this.mode === 'firebase') {
      await addDoc(collection(this.db, 'communities'), {
        ...commData,
        timestamp: Date.now()
      });
    } else {
      const comms = JSON.parse(localStorage.getItem('moodbubble_communities') || '[]');
      const newComm = {
        id: 'comm_' + Math.random().toString(36).substr(2, 9),
        ...commData,
        timestamp: Date.now()
      };
      comms.push(newComm);
      localStorage.setItem('moodbubble_communities', JSON.stringify(comms));
      MockEvents.publish('communities_updated');
    }
  },

  listenCommunities(callback) {
    if (this.mode === 'firebase') {
      const q = query(collection(this.db, 'communities'), orderBy('timestamp', 'desc'));
      return onSnapshot(q, (snapshot) => {
        const comms = [];
        snapshot.forEach(doc => {
          comms.push({ id: doc.id, ...doc.data() });
        });
        callback(comms);
      });
    } else {
      const fetchAndCallback = () => {
        const comms = JSON.parse(localStorage.getItem('moodbubble_communities') || '[]');
        comms.sort((a, b) => b.timestamp - a.timestamp);
        callback(comms);
      };
      fetchAndCallback();
      return MockEvents.subscribe('communities_updated', fetchAndCallback);
    }
  },

  async addChatMessage(commId, msgData) {
    if (this.mode === 'firebase') {
      await addDoc(collection(this.db, 'communities', commId, 'messages'), {
        ...msgData,
        timestamp: Date.now()
      });
    } else {
      const chatKey = `moodbubble_chats_${commId}`;
      const messages = JSON.parse(localStorage.getItem(chatKey) || '[]');
      const newMsg = {
        id: 'msg_' + Math.random().toString(36).substr(2, 9),
        ...msgData,
        timestamp: Date.now()
      };
      messages.push(newMsg);
      localStorage.setItem(chatKey, JSON.stringify(messages));
      MockEvents.publish(`chats_updated_${commId}`);
    }
  },

  listenChatMessages(commId, callback) {
    if (this.mode === 'firebase') {
      const q = query(collection(this.db, 'communities', commId, 'messages'), orderBy('timestamp', 'asc'));
      return onSnapshot(q, (snapshot) => {
        const messages = [];
        snapshot.forEach(doc => {
          messages.push({ id: doc.id, ...doc.data() });
        });
        callback(messages);
      });
    } else {
      const fetchAndCallback = () => {
        const chatKey = `moodbubble_chats_${commId}`;
        const messages = JSON.parse(localStorage.getItem(chatKey) || '[]');
        messages.sort((a, b) => a.timestamp - b.timestamp);
        callback(messages);
      };
      fetchAndCallback();
      return MockEvents.subscribe(`chats_updated_${commId}`, fetchAndCallback);
    }
  },

  async addTask(commId, taskData) {
    if (this.mode === 'firebase') {
      await addDoc(collection(this.db, 'communities', commId, 'tasks'), {
        ...taskData,
        completed: false,
        completedBy: null,
        timestamp: Date.now()
      });
    } else {
      const taskKey = `moodbubble_tasks_${commId}`;
      const tasks = JSON.parse(localStorage.getItem(taskKey) || '[]');
      const newTask = {
        id: 'task_' + Math.random().toString(36).substr(2, 9),
        ...taskData,
        completed: false,
        completedBy: null,
        timestamp: Date.now()
      };
      tasks.push(newTask);
      localStorage.setItem(taskKey, JSON.stringify(tasks));
      MockEvents.publish(`tasks_updated_${commId}`);
    }
  },

  listenTasks(commId, callback) {
    if (this.mode === 'firebase') {
      const q = query(collection(this.db, 'communities', commId, 'tasks'), orderBy('dueDate', 'asc'));
      return onSnapshot(q, (snapshot) => {
        const tasks = [];
        snapshot.forEach(doc => {
          tasks.push({ id: doc.id, ...doc.data() });
        });
        callback(tasks);
      });
    } else {
      const fetchAndCallback = () => {
        const taskKey = `moodbubble_tasks_${commId}`;
        const tasks = JSON.parse(localStorage.getItem(taskKey) || '[]');
        // Sort: pending first, then by dueDate asc
        tasks.sort((a, b) => {
          if (a.completed !== b.completed) {
            return a.completed ? 1 : -1;
          }
          return a.dueDate.localeCompare(b.dueDate);
        });
        callback(tasks);
      };
      fetchAndCallback();
      return MockEvents.subscribe(`tasks_updated_${commId}`, fetchAndCallback);
    }
  },

  async toggleTask(commId, taskId, completedStatus, completedBy) {
    if (this.mode === 'firebase') {
      const ref = doc(this.db, 'communities', commId, 'tasks', taskId);
      await updateDoc(ref, {
        completed: completedStatus,
        completedBy: completedStatus ? completedBy : null
      });
    } else {
      const taskKey = `moodbubble_tasks_${commId}`;
      const tasks = JSON.parse(localStorage.getItem(taskKey) || '[]');
      const task = tasks.find(t => t.id === taskId);
      if (task) {
        task.completed = completedStatus;
        task.completedBy = completedStatus ? completedBy : null;
        localStorage.setItem(taskKey, JSON.stringify(tasks));
        MockEvents.publish(`tasks_updated_${commId}`);
      }
    }
  }
};

// ==========================================
// APP INITIALIZATION & PROFILE SETUP
// ==========================================
let currentUser = null;
let activeCommunityId = null;
let activeUnsubscribes = [];

// Init mock data first
initMockData();

// Init Database Connection
function connectDatabase() {
  const statusBtn = document.getElementById('db-status-btn');
  const statusDot = document.getElementById('db-status-dot');
  const statusText = document.getElementById('db-status-text');
  const statusDotMobile = document.getElementById('db-status-dot-mobile');

  const savedConfig = localStorage.getItem('moodbubble_firebase_config');
  let parsedConfig = null;

  if (savedConfig === 'mock') {
    parsedConfig = null;
  } else if (savedConfig) {
    try {
      parsedConfig = JSON.parse(savedConfig);
    } catch (e) {
      console.error("Firebase config parse error", e);
    }
  } else {
    // Default fallback to user's Firebase project
    parsedConfig = {
      apiKey: "AIzaSyDz2i7hTTYHsyYUhCEVgcBMFoyHPOR-_xQ",
      authDomain: "moodbubble-app.firebaseapp.com",
      projectId: "moodbubble-app",
      storageBucket: "moodbubble-app.firebasestorage.app",
      messagingSenderId: "213725501252",
      appId: "1:213725501252:web:3580ad891388a9f5e1e911"
    };
  }

  if (parsedConfig && parsedConfig.apiKey && parsedConfig.projectId) {
    try {
      const app = initializeApp(parsedConfig);
      DB.db = getFirestore(app);
      DB.auth = getAuth(app);
      DB.mode = 'firebase';
      
      statusDot.className = 'w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse';
      if (statusDotMobile) statusDotMobile.className = 'w-2 h-2 rounded-full bg-emerald-500 animate-pulse';
      statusText.textContent = 'Firestore Connected';
      console.log("🟢 Firebase Firestore initialized successfully!");

      // Set up Auth state change observer
      onAuthStateChanged(DB.auth, (user) => {
        if (user) {
          currentUser = {
            nickname: user.displayName || 'Google Student',
            avatar: '🎓'
          };
          localStorage.setItem('moodbubble_user', JSON.stringify(currentUser));
          checkUserProfile();
        }
      });
    } catch (err) {
      console.error("🔴 Firebase Firestore connection failed:", err);
      DB.mode = 'mock';
      statusDot.className = 'w-2.5 h-2.5 rounded-full bg-rose-500';
      if (statusDotMobile) statusDotMobile.className = 'w-2 h-2 rounded-full bg-rose-500';
      statusText.textContent = 'Firebase Connection Error';
      showToast('⚠️', 'Connection failed! Using local Mock Mode.');
    }
  } else {
    DB.mode = 'mock';
    statusDot.className = 'w-2.5 h-2.5 rounded-full bg-amber-500';
    if (statusDotMobile) statusDotMobile.className = 'w-2 h-2 rounded-full bg-amber-500';
    statusText.textContent = 'Mock Mode (Local)';
    console.log("🟡 Operating in Mock Mode using localStorage.");
  }
}

// User Authentication Handler
function checkUserProfile() {
  const profileWidget = document.getElementById('user-profile-widget');
  const authModal = document.getElementById('auth-modal');
  const widgetAvatar = document.getElementById('widget-avatar');
  const widgetNickname = document.getElementById('widget-nickname');

  const localProfile = localStorage.getItem('moodbubble_user');
  if (localProfile) {
    currentUser = JSON.parse(localProfile);
    widgetAvatar.textContent = currentUser.avatar;
    widgetNickname.textContent = currentUser.nickname;
    
    // Update handle
    const widgetHandle = document.getElementById('widget-handle');
    if (widgetHandle) {
      widgetHandle.textContent = `@${currentUser.nickname.toLowerCase().replace(/\s+/g, '')}`;
    }
    
    // Update compose avatar
    const composeAvatar = document.getElementById('compose-avatar');
    if (composeAvatar) {
      composeAvatar.textContent = currentUser.avatar;
    }

    // Update mobile profile button avatar
    const mobProfileBtn = document.getElementById('mobile-profile-btn');
    if (mobProfileBtn) {
      mobProfileBtn.textContent = currentUser.avatar;
    }
    
    profileWidget.classList.remove('hidden');
    authModal.classList.add('hidden');
  } else {
    profileWidget.classList.add('hidden');
    authModal.classList.remove('hidden');
  }
}

// Save User Profile
function saveUserProfile(nickname, avatar) {
  const trimmed = nickname.trim();
  if (!trimmed) return;
  currentUser = { nickname: trimmed, avatar };
  localStorage.setItem('moodbubble_user', JSON.stringify(currentUser));
  checkUserProfile();
  showToast('🎉', `Welcome aboard, ${trimmed}!`);
}

// Toast alerts helper
function showToast(icon, message) {
  const toast = document.getElementById('toast');
  const toastIcon = document.getElementById('toast-icon');
  const toastMsg = document.getElementById('toast-message');

  toastIcon.textContent = icon;
  toastMsg.textContent = message;

  toast.classList.remove('translate-y-24', 'opacity-0');
  toast.classList.add('translate-y-0', 'opacity-100');

  setTimeout(() => {
    toast.classList.remove('translate-y-0', 'opacity-100');
    toast.classList.add('translate-y-24', 'opacity-0');
  }, 3000);
}

// Relative time formatting
function formatTime(timestamp) {
  if (!timestamp) return 'Just now';
  const diff = Date.now() - timestamp;
  if (diff < 60000) return 'Just now';
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// ==========================================
// SCREEN 1: FEELINGS TIMELINE LOGIC
// ==========================================
let selectedMood = 'happy';
let selectedEmoji = '😊';

function selectMoodOption(element, mood, emoji) {
  document.querySelectorAll('.mood-option').forEach(btn => {
    btn.className = 'mood-option cartoon-btn btn-white flex-col py-3.5 gap-1.5 rounded-lg border border-slate-200 hover:border-slate-300 hover:bg-slate-50';
    const span = btn.querySelector('span.text-2xl');
    if (span) span.classList.remove('animate-bounce-slow');
  });

  element.className = 'mood-option cartoon-btn btn-yellow flex-col py-3.5 gap-1.5 rounded-lg border-yellow-300';
  const selectedSpan = element.querySelector('span.text-2xl');
  if (selectedSpan) selectedSpan.classList.add('animate-bounce-slow');
  
  selectedMood = mood;
  selectedEmoji = emoji;
}

// Load and Render Feelings timeline
function initFeedListener() {
  // Clear any existing active page listener unsubscribes
  activeUnsubscribes.forEach(unsub => unsub());
  activeUnsubscribes = [];

  const container = document.getElementById('posts-container');

  const unsub = DB.listenPosts((posts) => {
    if (posts.length === 0) {
      container.innerHTML = `
        <div class="cartoon-box p-8 bg-white text-center border border-slate-200">
          <p class="font-medium text-sm text-slate-400">No feelings shared yet. Be the first to express yourself! 🎈</p>
        </div>
      `;
      return;
    }

    container.innerHTML = '';

    const moodBadgeClasses = {
      excited: 'bg-rose-50 text-rose-700 border-rose-100',
      happy: 'bg-amber-50 text-amber-700 border-amber-100',
      tired: 'bg-sky-50 text-sky-700 border-sky-100',
      anxious: 'bg-purple-50 text-purple-700 border-purple-100',
      moody: 'bg-orange-50 text-orange-700 border-orange-100'
    };

    posts.forEach((post) => {
      const postCard = document.createElement('article');
      postCard.className = `cartoon-box p-4 bg-white border border-slate-200 animate-pop`;
      
      const reactionCountHugs = (post.reactions && post.reactions.hugs) || 0;
      const reactionCountSame = (post.reactions && post.reactions.same) || 0;
      const reactionCountSupport = (post.reactions && post.reactions.support) || 0;
      
      const moodClass = moodBadgeClasses[post.mood] || 'bg-slate-50 text-slate-700 border-slate-100';
      const handle = `@${post.nickname.toLowerCase().replace(/\s+/g, '')}`;

      postCard.innerHTML = `
        <div class="flex gap-3">
          <!-- Left column: Circular Avatar -->
          <span class="avatar-circle">${post.avatar || '🦊'}</span>
          
          <!-- Right column: Post content and headers -->
          <div class="flex-1 flex flex-col gap-1 overflow-hidden">
            <!-- Header Row -->
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-1.5 overflow-hidden">
                <span class="font-bold text-slate-800 text-sm truncate leading-tight">${post.nickname}</span>
                <span class="text-[11px] text-slate-400 truncate leading-tight">${handle}</span>
                <span class="text-[10px] text-slate-300 leading-none select-none">•</span>
                <span class="text-[10px] text-slate-400 shrink-0 leading-tight">${formatTime(post.timestamp)}</span>
              </div>
              
              <!-- Mood Pill Badge -->
              <div class="px-2 py-0.5 rounded-full text-[10px] font-semibold border flex items-center gap-1 shrink-0 ${moodClass}">
                <span>${post.emoji}</span>
                <span class="capitalize">${post.mood}</span>
              </div>
            </div>
            
            <!-- Post content body -->
            <p class="text-xs md:text-sm text-slate-700 leading-relaxed whitespace-pre-line mt-1 pr-1">${post.content}</p>
            
            <!-- Reactions Actions Row -->
            <div class="flex items-center gap-6 mt-3 pt-2 border-t border-slate-50">
              <button class="react-btn social-react-btn react-hugs" data-post-id="${post.id}" data-type="hugs">
                <span class="text-sm">❤️</span>
                <span class="react-badge">${reactionCountHugs}</span>
              </button>
              
              <button class="react-btn social-react-btn react-same" data-post-id="${post.id}" data-type="same">
                <span class="text-sm">🔁</span>
                <span class="react-badge">${reactionCountSame}</span>
              </button>

              <button class="react-btn social-react-btn react-support" data-post-id="${post.id}" data-type="support">
                <span class="text-sm">⚡</span>
                <span class="react-badge">${reactionCountSupport}</span>
              </button>
            </div>
          </div>
        </div>
      `;
      container.appendChild(postCard);
    });

    // Add events to reaction buttons
    container.querySelectorAll('.react-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const button = e.currentTarget;
        const postId = button.getAttribute('data-post-id');
        const type = button.getAttribute('data-type');
        
        // Disable button briefly to prevent double taps
        button.disabled = true;
        try {
          await DB.addReaction(postId, type);
          showToast('💖', 'Reaction sent!');
        } catch (error) {
          console.error(error);
        } finally {
          button.disabled = false;
        }
      });
    });
  });

  activeUnsubscribes.push(unsub);
}

// ==========================================
// SCREEN 2: COMMUNITIES GALLERY
// ==========================================
function initCommunitiesListener() {
  activeUnsubscribes.forEach(unsub => unsub());
  activeUnsubscribes = [];

  const grid = document.getElementById('communities-grid');

  const unsub = DB.listenCommunities((comms) => {
    grid.innerHTML = '';
    
    // Add default template cards
    comms.forEach((comm) => {
      const card = document.createElement('div');
      card.className = 'cartoon-box p-5 bg-white border border-slate-200 flex flex-col justify-between gap-4 animate-pop';
      
      const isExclusive = comm.accessCode && comm.accessCode.trim().length > 0;
      const lockBadge = isExclusive 
        ? `<span class="text-[10px] px-2 py-0.5 rounded-full font-semibold border bg-rose-50 text-rose-600 border-rose-100 flex items-center gap-1 shrink-0"><span class="text-[9px]">🔒</span> Exclusive</span>` 
        : '';

      card.innerHTML = `
        <div>
          <div class="flex items-center justify-between gap-2 mb-2">
            <div class="flex items-center gap-3 overflow-hidden">
              <span class="text-2xl p-1.5 bg-slate-50 border border-slate-200 rounded-lg shrink-0">${comm.icon}</span>
              <h3 class="text-lg font-bold text-slate-800 truncate">${comm.name}</h3>
            </div>
            ${lockBadge}
          </div>
          <p class="text-xs text-slate-500 leading-relaxed">${comm.description}</p>
        </div>
        <button class="join-comm-btn cartoon-btn btn-blue w-full py-2 text-xs font-semibold gap-1.5 rounded-lg border border-indigo-600 shadow-sm" 
          data-id="${comm.id}" 
          data-name="${comm.name}" 
          data-icon="${comm.icon}" 
          data-desc="${comm.description}"
          data-code="${comm.accessCode || ''}">
          <span>Enter Group</span>
          <span>🚪</span>
        </button>
      `;
      grid.appendChild(card);
    });

    grid.querySelectorAll('.join-comm-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const cId = btn.getAttribute('data-id');
        const cName = btn.getAttribute('data-name');
        const cIcon = btn.getAttribute('data-icon');
        const cDesc = btn.getAttribute('data-desc');
        const cCode = btn.getAttribute('data-code');
        
        if (cCode && cCode.trim().length > 0) {
          const userInput = prompt(`🔒 "${cName}" is passcode protected. Please enter the Access Code:`);
          if (userInput === null) return; // user cancelled prompt
          if (userInput.trim() !== cCode.trim()) {
            showToast('❌', 'Access denied. Incorrect access code!');
            return;
          }
        }
        
        openCommunity(cId, cName, cIcon, cDesc);
      });
    });
  });

  activeUnsubscribes.push(unsub);
}

// ==========================================
// SCREEN 3: ACTIVE COMMUNITY (CHAT + MISSIONS)
// ==========================================
function openCommunity(id, name, icon, desc) {
  activeCommunityId = id;
  
  // Set headers
  document.getElementById('active-comm-icon').textContent = icon;
  document.getElementById('active-comm-name').textContent = name;
  document.getElementById('active-comm-desc').textContent = desc;

  // Toggle screens
  document.getElementById('screen-communities').classList.add('hidden');
  document.getElementById('screen-active-community').classList.remove('hidden');

  // Cancel existing listeners and initiate active room listeners
  activeUnsubscribes.forEach(unsub => unsub());
  activeUnsubscribes = [];

  // Init chat room message list
  const chatContainer = document.getElementById('chat-messages-container');
  chatContainer.innerHTML = `
    <div class="text-center py-6 text-slate-400 text-xs font-semibold">
      Connecting to chat...
    </div>
  `;

  const unsubChat = DB.listenChatMessages(id, (messages) => {
    chatContainer.innerHTML = '';
    if (messages.length === 0) {
      chatContainer.innerHTML = `
        <div class="text-center py-8 text-slate-400 text-[10px] font-semibold uppercase tracking-wider leading-relaxed max-w-xs mx-auto">
          👋 Start of conversation. Send a message to get study buddies going!
        </div>
      `;
      return;
    }

    messages.forEach(msg => {
      const isMe = currentUser && msg.nickname === currentUser.nickname;
      const bubbleWrap = document.createElement('div');
      bubbleWrap.className = `flex gap-2.5 max-w-full ${isMe ? 'flex-row-reverse self-end' : 'self-start'}`;

      const avatarBox = `<span class="avatar-circle-sm self-end shadow-sm bg-white">${msg.avatar || '🦊'}</span>`;
      
      const speechBubble = `
        <div class="flex flex-col ${isMe ? 'items-end' : 'items-start'}">
          <span class="text-[10px] font-bold text-slate-400 mb-0.5 px-1">${msg.nickname}</span>
          <div class="speech-bubble ${isMe ? 'speech-bubble-right' : 'speech-bubble-left'}">
            <p class="text-xs break-words">${msg.content}</p>
          </div>
          <span class="text-[9px] text-slate-400 mt-0.5 px-1">${formatTime(msg.timestamp)}</span>
        </div>
      `;

      bubbleWrap.innerHTML = isMe ? `${speechBubble}${avatarBox}` : `${avatarBox}${speechBubble}`;
      chatContainer.appendChild(bubbleWrap);
    });

    // Auto scroll chat to bottom
    chatContainer.scrollTop = chatContainer.scrollHeight;
  });

  // Init mission board
  const taskContainer = document.getElementById('missions-container');
  taskContainer.innerHTML = `
    <div class="text-center py-6 text-slate-400 text-xs font-semibold">
      Syncing board...
    </div>
  `;

  const unsubTasks = DB.listenTasks(id, (tasks) => {
    taskContainer.innerHTML = '';
    if (tasks.length === 0) {
      taskContainer.innerHTML = `
        <div class="text-center py-8 text-slate-400 text-xs font-medium">
          🎯 No active missions. Add a task/goal below to track group progress!
        </div>
      `;
      return;
    }

    tasks.forEach(task => {
      const item = document.createElement('div');
      item.className = `cartoon-box p-2.5 border border-slate-200 flex items-center justify-between gap-3 animate-pop rounded-lg ${task.completed ? 'bg-slate-50/80 opacity-70' : 'bg-white'}`;
      
      // Determine badge color
      let badgeClass = 'bg-purple-50 text-purple-600 border-purple-100';
      if (task.type.includes('📚')) badgeClass = 'bg-sky-50 text-sky-600 border-sky-100';
      if (task.type.includes('📝')) badgeClass = 'bg-rose-50 text-rose-600 border-rose-100';
      if (task.type.includes('📅')) badgeClass = 'bg-orange-50 text-orange-600 border-orange-100';

      const completedSubtext = task.completed 
        ? `<span class="text-[10px] font-semibold text-emerald-600 block leading-tight mt-0.5">Completed by ${task.completedBy || 'Student'} ✓</span>` 
        : `<span class="text-[10px] text-slate-400 block leading-tight mt-0.5">Due: ${task.dueDate}</span>`;

      item.innerHTML = `
        <div class="flex items-center gap-3 overflow-hidden">
          <!-- Checkbox -->
          <div class="task-check cartoon-checkbox shrink-0 ${task.completed ? 'checked' : ''}" data-task-id="${task.id}" data-checked="${task.completed}"></div>
          <div class="overflow-hidden">
            <span class="text-[10px] px-2 py-0.5 rounded-full font-semibold border ${badgeClass} inline-block leading-none mb-1">${task.type}</span>
            <h4 class="font-bold text-xs text-slate-700 truncate ${task.completed ? 'line-through text-slate-400' : ''}">${task.title}</h4>
            ${completedSubtext}
          </div>
        </div>
      `;

      taskContainer.appendChild(item);
    });

    // Checkbox click bindings
    taskContainer.querySelectorAll('.task-check').forEach(box => {
      box.addEventListener('click', async (e) => {
        const target = e.currentTarget;
        const taskId = target.getAttribute('data-task-id');
        const currentCompleted = target.getAttribute('data-checked') === 'true';
        
        target.style.pointerEvents = 'none'; // prevent rapid clicks
        try {
          await DB.toggleTask(id, taskId, !currentCompleted, currentUser.nickname);
          showToast('🎯', !currentCompleted ? 'Mission complete!' : 'Mission updated.');
        } catch (error) {
          console.error(error);
        }
      });
    });
  });

  activeUnsubscribes.push(unsubChat, unsubTasks);
}

// Leave active community
function leaveCommunity() {
  activeCommunityId = null;
  document.getElementById('screen-active-community').classList.add('hidden');
  document.getElementById('screen-communities').classList.remove('hidden');
  
  // Reconnect standard communities observer
  initCommunitiesListener();
}

// ==========================================
// EVENT LISTENERS & DOM EVENT ROUTING
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  // Bind database initialization
  connectDatabase();

  // Profile auth triggers
  checkUserProfile();

  // Default page setup
  initFeedListener();

  // Screen menu toggles
  const btnFeed = document.getElementById('nav-feed');
  const btnCommunities = document.getElementById('nav-communities');
  const screenFeed = document.getElementById('screen-feed');
  const screenComms = document.getElementById('screen-communities');
  const screenActiveComm = document.getElementById('screen-active-community');

  const selectTab = (tab) => {
    // Desktop tabs active class toggle
    btnFeed.classList.toggle('active', tab === 'feed');
    btnCommunities.classList.toggle('active', tab === 'communities');
    
    // Mobile bottom tabs selectors
    const mobFeed = document.getElementById('mobile-nav-feed');
    const mobComms = document.getElementById('mobile-nav-communities');
    
    if (mobFeed && mobComms) {
      if (tab === 'feed') {
        mobFeed.className = 'flex flex-col items-center gap-0.5 text-indigo-600';
        mobComms.className = 'flex flex-col items-center gap-0.5 text-slate-400';
      } else {
        mobFeed.className = 'flex flex-col items-center gap-0.5 text-slate-400';
        mobComms.className = 'flex flex-col items-center gap-0.5 text-indigo-600';
      }
    }
    
    if (tab === 'feed') {
      screenFeed.classList.remove('hidden');
      screenComms.classList.add('hidden');
      screenActiveComm.classList.add('hidden');
      initFeedListener();
    } else {
      screenComms.classList.remove('hidden');
      screenFeed.classList.add('hidden');
      screenActiveComm.classList.add('hidden');
      initCommunitiesListener();
    }
  };

  btnFeed.addEventListener('click', () => selectTab('feed'));
  btnCommunities.addEventListener('click', () => selectTab('communities'));
  
  // Mobile Nav tab listeners
  const mobFeed = document.getElementById('mobile-nav-feed');
  const mobComms = document.getElementById('mobile-nav-communities');
  const mobConfig = document.getElementById('mobile-nav-config');
  
  if (mobFeed) mobFeed.addEventListener('click', () => selectTab('feed'));
  if (mobComms) mobComms.addEventListener('click', () => selectTab('communities'));
  if (mobConfig) {
    mobConfig.addEventListener('click', () => {
      document.getElementById('trigger-config-btn').click();
    });
  }

  // Mobile Top Header Actions
  const mobProfileBtn = document.getElementById('mobile-profile-btn');
  const dbStatusMobile = document.getElementById('db-status-btn-mobile');
  
  if (mobProfileBtn) {
    mobProfileBtn.addEventListener('click', () => {
      document.getElementById('change-profile-btn').click();
    });
  }
  if (dbStatusMobile) {
    dbStatusMobile.addEventListener('click', () => {
      document.getElementById('trigger-config-btn').click();
    });
  }

  // Edit profile button
  document.getElementById('change-profile-btn').addEventListener('click', () => {
    const authModal = document.getElementById('auth-modal');
    const inputNickname = document.getElementById('input-nickname');
    if (currentUser) {
      inputNickname.value = currentUser.nickname;
      document.querySelectorAll('.avatar-option').forEach(btn => {
        if (btn.getAttribute('data-avatar') === currentUser.avatar) {
          btn.className = 'avatar-option cartoon-btn btn-yellow py-2 text-2xl rounded-lg border-yellow-300';
        } else {
          btn.className = 'avatar-option cartoon-btn btn-white py-2 text-2xl rounded-lg';
        }
      });
    }
    authModal.classList.remove('hidden');
  });

  // Profile Selection Logic
  let selectedAvatar = '🦊';
  document.querySelectorAll('.avatar-option').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.avatar-option').forEach(b => b.className = 'avatar-option cartoon-btn btn-white py-2 text-2xl rounded-lg');
      e.currentTarget.className = 'avatar-option cartoon-btn btn-yellow py-2 text-2xl rounded-lg border-yellow-300';
      selectedAvatar = e.currentTarget.getAttribute('data-avatar');
    });
  });

  document.getElementById('save-profile-btn').addEventListener('click', () => {
    const nickInput = document.getElementById('input-nickname').value;
    if (nickInput.trim().length === 0) {
      showToast('⚠️', 'Please enter a valid nickname!');
      return;
    }
    saveUserProfile(nickInput, selectedAvatar);
  });

  // Google Sign-In Event Listener
  document.getElementById('google-login-btn').addEventListener('click', async () => {
    if (DB.mode !== 'firebase' || !DB.auth) {
      showToast('⚠️', 'Please connect a Firestore database first to enable Google Login!');
      return;
    }
    
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(DB.auth, provider);
      showToast('👋', 'Logged in successfully!');
    } catch (err) {
      console.error("Google Authentication error:", err);
      showToast('❌', 'Google login failed.');
    }
  });

  // Logout/Exit Event Listener
  document.getElementById('logout-btn').addEventListener('click', async () => {
    if (DB.mode === 'firebase' && DB.auth) {
      try {
        await signOut(DB.auth);
      } catch (e) {
        console.error("Firebase SignOut error:", e);
      }
    }
    localStorage.removeItem('moodbubble_user');
    currentUser = null;
    checkUserProfile();
    window.location.reload();
  });

  // Mood selection in Feed
  document.querySelectorAll('.mood-option').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const mood = btn.getAttribute('data-mood');
      const emoji = btn.getAttribute('data-emoji');
      selectMoodOption(btn, mood, emoji);
    });
  });

  // Init default mood bouncing state
  const defaultMoodBtn = document.querySelector('[data-mood="happy"]');
  if (defaultMoodBtn) {
    selectMoodOption(defaultMoodBtn, 'happy', '😊');
  }

  // Textarea input char limit
  const postTextarea = document.getElementById('post-textarea');
  const charCounter = document.getElementById('char-counter');
  postTextarea.addEventListener('input', () => {
    const chars = postTextarea.value.length;
    charCounter.textContent = `${chars} / 280 characters`;
  });

  // Post Submission
  document.getElementById('submit-post-btn').addEventListener('click', async () => {
    const text = postTextarea.value.trim();
    if (!text) {
      showToast('⚠️', 'Please write something before sharing!');
      return;
    }

    if (!currentUser) {
      checkUserProfile();
      return;
    }

    const postBtn = document.getElementById('submit-post-btn');
    postBtn.disabled = true;
    try {
      await DB.addPost({
        nickname: currentUser.nickname,
        avatar: currentUser.avatar,
        mood: selectedMood,
        emoji: selectedEmoji,
        content: text
      });
      postTextarea.value = '';
      charCounter.textContent = '0 / 280 characters';
      showToast('🚀', 'Your feeling has been shared!');
    } catch (e) {
      console.error(e);
      showToast('❌', 'Error writing to timeline.');
    } finally {
      postBtn.disabled = false;
    }
  });

  // Create Community Modal Trigger
  const createCommModal = document.getElementById('create-community-modal');
  document.getElementById('open-create-community-btn').addEventListener('click', () => {
    createCommModal.classList.remove('hidden');
  });

  document.getElementById('close-create-comm-btn').addEventListener('click', () => {
    createCommModal.classList.add('hidden');
  });

  // Community Create Form Submission
  document.getElementById('create-community-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const commName = document.getElementById('comm-name').value.trim();
    const commIcon = document.getElementById('comm-icon').value;
    const commDesc = document.getElementById('comm-desc').value.trim();
    const commCode = document.getElementById('comm-code').value.trim();

    if (!commName || !commDesc) {
      showToast('⚠️', 'Please complete all fields!');
      return;
    }

    try {
      await DB.addCommunity({
        name: commName,
        icon: commIcon,
        description: commDesc,
        accessCode: commCode
      });
      createCommModal.classList.add('hidden');
      document.getElementById('create-community-form').reset();
      showToast('🎉', 'New community created!');
    } catch (error) {
      console.error(error);
      showToast('❌', 'Failed to create community.');
    }
  });

  // Active community leave button
  document.getElementById('leave-community-btn').addEventListener('click', leaveCommunity);

  // Group chat submission
  const chatInput = document.getElementById('chat-input');
  const sendChatBtn = document.getElementById('send-chat-btn');

  const submitChatMessage = async () => {
    const text = chatInput.value.trim();
    if (!text || !activeCommunityId) return;

    if (!currentUser) {
      checkUserProfile();
      return;
    }

    sendChatBtn.disabled = true;
    try {
      await DB.addChatMessage(activeCommunityId, {
        nickname: currentUser.nickname,
        avatar: currentUser.avatar,
        content: text
      });
      chatInput.value = '';
    } catch (e) {
      console.error(e);
    } finally {
      sendChatBtn.disabled = false;
    }
  };

  sendChatBtn.addEventListener('click', submitChatMessage);
  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submitChatMessage();
  });

  // Group task/mission submission
  document.getElementById('add-mission-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = document.getElementById('mission-title').value.trim();
    const type = document.getElementById('mission-type').value;
    const dueDate = document.getElementById('mission-date').value;

    if (!title || !dueDate || !activeCommunityId) return;

    try {
      await DB.addTask(activeCommunityId, {
        title,
        type,
        dueDate
      });
      document.getElementById('add-mission-form').reset();
      showToast('🎯', 'Mission added to board!');
    } catch (error) {
      console.error(error);
    }
  });

  // Configuration Modal toggles
  const configModal = document.getElementById('firebase-config-modal');
  document.getElementById('trigger-config-btn').addEventListener('click', () => {
    // Pre-populate configuration fields
    const saved = localStorage.getItem('moodbubble_firebase_config');
    let parsed = {
      apiKey: "AIzaSyDz2i7hTTYHsyYUhCEVgcBMFoyHPOR-_xQ",
      authDomain: "moodbubble-app.firebaseapp.com",
      projectId: "moodbubble-app",
      appId: "1:213725501252:web:3580ad891388a9f5e1e911"
    };
    if (saved && saved !== 'mock') {
      try {
        parsed = JSON.parse(saved);
      } catch (err) {}
    }
    document.getElementById('cfg-apikey').value = parsed.apiKey || '';
    document.getElementById('cfg-projectid').value = parsed.projectId || '';
    document.getElementById('cfg-authdomain').value = parsed.authDomain || '';
    document.getElementById('cfg-appid').value = parsed.appId || '';
    configModal.classList.remove('hidden');
  });

  document.getElementById('close-config-btn').addEventListener('click', () => {
    configModal.classList.add('hidden');
  });

  // Config Form submit
  document.getElementById('firebase-config-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const apiKey = document.getElementById('cfg-apikey').value.trim();
    const projectId = document.getElementById('cfg-projectid').value.trim();
    const authDomain = document.getElementById('cfg-authdomain').value.trim();
    const appId = document.getElementById('cfg-appid').value.trim();

    if (!apiKey || !projectId) {
      showToast('⚠️', 'API Key and Project ID are required!');
      return;
    }

    const configObject = { apiKey, projectId, authDomain, appId };
    localStorage.setItem('moodbubble_firebase_config', JSON.stringify(configObject));
    configModal.classList.add('hidden');
    window.location.reload(); // Reload to initialize Firebase configuration
  });

  // Mock Mode Disconnect
  document.getElementById('use-mock-btn').addEventListener('click', () => {
    localStorage.setItem('moodbubble_firebase_config', 'mock');
    configModal.classList.add('hidden');
    window.location.reload(); // Reload to disconnect
  });
});
