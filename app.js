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
  getDocs,
  setDoc,
  where
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { 
  getAuth, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut, 
  onAuthStateChanged 
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';

// ==========================================
// DATA CONTROLLER INTERFACE (FIRESTORE)
// ==========================================
const DB = {
  db: null,
  auth: null,

  async addPost(postData) {
    await addDoc(collection(this.db, 'posts'), {
      ...postData,
      timestamp: Date.now(),
      reactions: { hugs: 0, same: 0, support: 0 }
    });
  },

  listenPosts(callback) {
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
  },

  async addReaction(postId, reactionType) {
    const ref = doc(this.db, 'posts', postId);
    const updates = {};
    updates[`reactions.${reactionType}`] = increment(1);
    await updateDoc(ref, updates);
  },

  async addCommunity(commData) {
    await addDoc(collection(this.db, 'communities'), {
      ...commData,
      timestamp: Date.now()
    });
  },

  listenCommunities(callback) {
    const q = query(collection(this.db, 'communities'), orderBy('timestamp', 'desc'));
    return onSnapshot(q, (snapshot) => {
      const comms = [];
      snapshot.forEach(doc => {
        comms.push({ id: doc.id, ...doc.data() });
      });
      callback(comms);
    });
  },

  async addChatMessage(commId, msgData) {
    await addDoc(collection(this.db, 'communities', commId, 'messages'), {
      ...msgData,
      timestamp: Date.now()
    });
  },

  listenChatMessages(commId, callback) {
    const q = query(collection(this.db, 'communities', commId, 'messages'), orderBy('timestamp', 'asc'));
    return onSnapshot(q, (snapshot) => {
      const messages = [];
      snapshot.forEach(doc => {
        messages.push({ id: doc.id, ...doc.data() });
      });
      callback(messages);
    });
  },

  async addTask(commId, taskData) {
    await addDoc(collection(this.db, 'communities', commId, 'tasks'), {
      ...taskData,
      completed: false,
      completedBy: null,
      timestamp: Date.now()
    });
  },

  listenTasks(commId, callback) {
    const q = query(collection(this.db, 'communities', commId, 'tasks'), orderBy('dueDate', 'asc'));
    return onSnapshot(q, (snapshot) => {
      const tasks = [];
      snapshot.forEach(doc => {
        tasks.push({ id: doc.id, ...doc.data() });
      });
      callback(tasks);
    });
  },

  async toggleTask(commId, taskId, completedStatus, completedBy) {
    const ref = doc(this.db, 'communities', commId, 'tasks', taskId);
    await updateDoc(ref, {
      completed: completedStatus,
      completedBy: completedStatus ? completedBy : null
    });
  },

  // --- NEW USER DIRECTORY & FRIENDS SYSTEM APIs ---
  listenUsers(callback) {
    const q = query(collection(this.db, 'users'), limit(150));
    return onSnapshot(q, (snapshot) => {
      const users = [];
      snapshot.forEach(doc => {
        users.push(doc.data());
      });
      callback(users);
    });
  },

  listenFriendships(uid, callback) {
    const q = query(collection(this.db, 'friendships'), where('users', 'array-contains', uid));
    return onSnapshot(q, (snapshot) => {
      const friendships = [];
      snapshot.forEach(doc => {
        friendships.push({ id: doc.id, ...doc.data() });
      });
      callback(friendships);
    });
  },

  async sendFriendRequest(myUid, targetUid) {
    const friendshipId = myUid < targetUid ? `${myUid}_${targetUid}` : `${targetUid}_${myUid}`;
    const ref = doc(this.db, 'friendships', friendshipId);
    await setDoc(ref, {
      id: friendshipId,
      users: [myUid, targetUid],
      status: 'pending',
      senderId: myUid,
      timestamp: Date.now()
    }, { merge: true });
  },

  async acceptFriendRequest(myUid, targetUid) {
    const friendshipId = myUid < targetUid ? `${myUid}_${targetUid}` : `${targetUid}_${myUid}`;
    const ref = doc(this.db, 'friendships', friendshipId);
    await updateDoc(ref, {
      status: 'accepted',
      timestamp: Date.now()
    });
  },

  // --- NEW PRIVATE 1-ON-1 CHAT APIs ---
  async sendPrivateMessage(chatId, msgData) {
    await addDoc(collection(this.db, 'private_chats', chatId, 'messages'), {
      ...msgData,
      timestamp: Date.now()
    });
  },

  listenPrivateMessages(chatId, callback) {
    const q = query(collection(this.db, 'private_chats', chatId, 'messages'), orderBy('timestamp', 'asc'));
    return onSnapshot(q, (snapshot) => {
      const messages = [];
      snapshot.forEach(doc => {
        messages.push({ id: doc.id, ...doc.data() });
      });
      callback(messages);
    });
  }
};

// ==========================================
// APP INITIALIZATION & PROFILE SETUP
// ==========================================
let currentUser = null;
let activeCommunityId = null;
let activeUnsubscribes = [];

// New Direct Messaging and Friends State Variables
let allUsers = [];
let allFriendships = [];
let activeDmFriendshipId = null;
let activeDmFriend = null;

const firebaseConfig = {
  apiKey: "AIzaSyDz2i7hTTYHsyYUhCEVgcBMFoyHPOR-_xQ",
  authDomain: "moodbubble-app.firebaseapp.com",
  projectId: "moodbubble-app",
  storageBucket: "moodbubble-app.firebasestorage.app",
  messagingSenderId: "213725501252",
  appId: "1:213725501252:web:3580ad891388a9f5e1e911"
};

const app = initializeApp(firebaseConfig);
DB.db = getFirestore(app);
DB.auth = getAuth(app);

// Sync user profile to Firestore
async function syncUserProfile(uid, nickname, avatar) {
  if (!DB.db) return;
  try {
    const userRef = doc(DB.db, 'users', uid);
    await setDoc(userRef, {
      uid: uid,
      nickname: nickname,
      avatar: avatar,
      lastActive: Date.now()
    }, { merge: true });
  } catch (err) {
    console.error("Error syncing user profile:", err);
  }
}

// Observe Authentication state
onAuthStateChanged(DB.auth, (user) => {
  if (user) {
    currentUser = {
      uid: user.uid,
      nickname: user.displayName || 'Google Student',
      avatar: '🎓'
    };
    localStorage.setItem('moodbubble_user', JSON.stringify(currentUser));
    checkUserProfile();
  }
});

// User Authentication Handler
function checkUserProfile() {
  const profileWidget = document.getElementById('user-profile-widget');
  const authModal = document.getElementById('auth-modal');
  const widgetAvatar = document.getElementById('widget-avatar');
  const widgetNickname = document.getElementById('widget-nickname');

  const localProfile = localStorage.getItem('moodbubble_user');
  if (localProfile) {
    currentUser = JSON.parse(localProfile);
    
    // Ensure UID exists for guest users
    if (!currentUser.uid) {
      let guestUid = localStorage.getItem('moodbubble_uid');
      if (!guestUid) {
        guestUid = 'guest_' + Math.random().toString(36).substr(2, 9);
        localStorage.setItem('moodbubble_uid', guestUid);
      }
      currentUser.uid = guestUid;
      localStorage.setItem('moodbubble_user', JSON.stringify(currentUser));
    }

    setAvatarElement(widgetAvatar, currentUser.avatar);
    widgetNickname.textContent = currentUser.nickname;
    


    // Update handle
    const widgetHandle = document.getElementById('widget-handle');
    if (widgetHandle) {
      widgetHandle.textContent = `@${currentUser.nickname.toLowerCase().replace(/\s+/g, '')}`;
    }
    
    // Update compose avatar
    const composeAvatar = document.getElementById('compose-avatar');
    if (composeAvatar) {
      setAvatarElement(composeAvatar, currentUser.avatar);
    }

    // Update mobile profile button avatar
    const mobProfileBtn = document.getElementById('mobile-profile-btn');
    if (mobProfileBtn) {
      setAvatarElement(mobProfileBtn, currentUser.avatar);
    }
    
    profileWidget.classList.remove('hidden');
    authModal.classList.add('hidden');

    // Sync to Firestore
    syncUserProfile(currentUser.uid, currentUser.nickname, currentUser.avatar);
  } else {
    profileWidget.classList.add('hidden');
    authModal.classList.remove('hidden');
  }
}

// Save User Profile
async function saveUserProfile(nickname, avatar) {
  const trimmed = nickname.trim();
  if (!trimmed) return;
  
  let uid = localStorage.getItem('moodbubble_uid');
  if (!uid) {
    uid = 'guest_' + Math.random().toString(36).substr(2, 9);
    localStorage.setItem('moodbubble_uid', uid);
  }

  if (DB.auth && DB.auth.currentUser) {
    uid = DB.auth.currentUser.uid;
  }



  currentUser = { uid, nickname: trimmed, avatar };
  localStorage.setItem('moodbubble_user', JSON.stringify(currentUser));
  checkUserProfile();
  showToast('🎉', `Welcome aboard, ${trimmed}!`);

  // Sync to firestore
  await syncUserProfile(uid, trimmed, avatar);
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

// ==========================================
// TELEGRAM BOT FILE UPLOAD & RENDERING
// ==========================================
async function uploadFileToTelegram(file) {
  const botToken = localStorage.getItem('moodbubble_tg_token') || "8814332884:AAEbI2UlM0WouNuEamtwyHYTTeY-UnvWWcY";
  const chatId = localStorage.getItem('moodbubble_tg_chat_id') || "-5277905163";

  if (!botToken || !chatId) {
    throw new Error("Telegram credentials are not configured! Please configure them in your profile settings.");
  }

  if (file.size > 40 * 1024 * 1024) {
    throw new Error("File size exceeds 40MB limit!");
  }

  const formData = new FormData();
  formData.append('chat_id', chatId);
  formData.append('document', file);

  const url = `https://api.telegram.org/bot${botToken}/sendDocument`;
  const response = await fetch(url, {
    method: 'POST',
    body: formData
  });

  if (!response.ok) {
    throw new Error(`Telegram API responded with ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();
  if (!data.ok) {
    throw new Error(`Telegram Bot Error: ${data.description}`);
  }

  const docData = data.result.document;
  if (!docData) {
    throw new Error("Telegram failed to process the upload. Make sure the bot is added to your chat/channel.");
  }

  const fileId = docData.file_id;
  const fileName = docData.file_name || file.name;
  const mimeType = docData.mime_type || file.type;
  const fileSize = docData.file_size || file.size;

  // Fetch the file path
  const getFileUrl = `https://api.telegram.org/bot${botToken}/getFile?file_id=${fileId}`;
  const pathResponse = await fetch(getFileUrl);
  const pathData = await pathResponse.json();

  if (!pathData.ok) {
    throw new Error(`Telegram path retrieval error: ${pathData.description}`);
  }

  const filePath = pathData.result.file_path;
  const fileUrl = `https://api.telegram.org/file/bot${botToken}/${filePath}`;

  return {
    url: fileUrl,
    name: fileName,
    type: mimeType,
    size: fileSize
  };
}

function renderFileAttachment(file, isMe = false) {
  const container = document.createElement('div');
  container.className = 'mt-2 select-text';

  const isImage = file.type && file.type.startsWith('image/');
  const isVideo = file.type && file.type.startsWith('video/');

  if (isImage) {
    const img = document.createElement('img');
    img.src = file.url;
    img.className = 'max-h-48 w-auto object-contain cursor-pointer rounded border border-slate-200/50 bg-white mt-1';
    img.loading = 'lazy';
    img.onclick = () => window.open(file.url, '_blank');
    container.appendChild(img);
  } else if (isVideo) {
    const video = document.createElement('video');
    video.src = file.url;
    video.controls = true;
    video.className = 'max-h-48 w-full object-contain rounded border border-slate-200/50 bg-white mt-1';
    container.appendChild(video);
  } else {
    const card = document.createElement('div');
    if (isMe) {
      card.className = 'flex items-center gap-2 p-2 bg-purple-600/55 border border-purple-700/50 rounded text-[10px] text-white max-w-xs mt-1';
    } else {
      card.className = 'flex items-center gap-2 p-2 bg-slate-50 border border-slate-200/60 rounded text-[10px] text-slate-700 max-w-xs mt-1';
    }

    const icon = document.createElement('span');
    icon.textContent = '📄';
    card.appendChild(icon);

    const link = document.createElement('a');
    link.href = file.url;
    link.target = '_blank';
    link.className = `underline font-semibold truncate flex-1 ${isMe ? 'hover:text-purple-200' : 'hover:text-indigo-600'}`;
    link.textContent = file.name || 'Attached File';
    card.appendChild(link);

    if (file.size) {
      const sizeStr = document.createElement('span');
      sizeStr.className = isMe ? 'text-[8px] text-purple-200 shrink-0' : 'text-[8px] text-slate-400 shrink-0';
      sizeStr.textContent = `(${(file.size / 1024 / 1024).toFixed(2)} MB)`;
      card.appendChild(sizeStr);
    }
    container.appendChild(card);
  }
  return container;
}

// Render avatar wrapper dynamically (supports emoji stickers and custom image URLs)
function renderAvatarHTML(avatar, sizeClass = 'avatar-circle') {
  if (!avatar) avatar = '🦊';
  const isUrl = avatar.startsWith('http://') || avatar.startsWith('https://');
  
  if (isUrl) {
    return `<span class="${sizeClass} overflow-hidden bg-slate-100 flex items-center justify-center border border-slate-200">
      <img src="${avatar}" class="w-full h-full object-cover rounded-full" />
    </span>`;
  } else {
    return `<span class="${sizeClass}">${avatar}</span>`;
  }
}

function setAvatarElement(element, avatar) {
  if (!element) return;
  if (!avatar) avatar = '🦊';
  const isUrl = avatar.startsWith('http://') || avatar.startsWith('https://');
  
  element.innerHTML = '';
  if (isUrl) {
    element.classList.add('overflow-hidden', 'bg-slate-100', 'flex', 'items-center', 'justify-center', 'border', 'border-slate-200');
    const img = document.createElement('img');
    img.src = avatar;
    img.className = 'w-full h-full object-cover rounded-full';
    element.appendChild(img);
  } else {
    element.classList.remove('overflow-hidden', 'bg-slate-100', 'flex', 'items-center', 'justify-center', 'border', 'border-slate-200');
    element.textContent = avatar;
  }
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
          ${renderAvatarHTML(post.avatar, 'avatar-circle')}
          
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
            
            <!-- Attachment placeholder -->
            <div class="post-file-container mt-1"></div>

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

      if (post.file) {
        const fileContainer = postCard.querySelector('.post-file-container');
        if (fileContainer) {
          fileContainer.appendChild(renderFileAttachment(post.file, false));
        }
      }

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

      const avatarBox = renderAvatarHTML(msg.avatar, 'avatar-circle-sm self-end shadow-sm bg-white');
      
      const speechBubble = `
        <div class="flex flex-col ${isMe ? 'items-end' : 'items-start'}">
          <span class="text-[10px] font-bold text-slate-400 mb-0.5 px-1">${msg.nickname}</span>
          <div class="speech-bubble ${isMe ? 'speech-bubble-right' : 'speech-bubble-left'}">
            <p class="text-xs break-words">${msg.content}</p>
            <div class="chat-file-container mt-1"></div>
          </div>
          <span class="text-[9px] text-slate-400 mt-0.5 px-1">${formatTime(msg.timestamp)}</span>
        </div>
      `;

      bubbleWrap.innerHTML = isMe ? `${speechBubble}${avatarBox}` : `${avatarBox}${speechBubble}`;

      if (msg.file) {
        const fileContainer = bubbleWrap.querySelector('.chat-file-container');
        if (fileContainer) {
          fileContainer.appendChild(renderFileAttachment(msg.file, isMe));
        }
      }

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

// ==========================================
// SCREEN 4: DIRECT MESSAGES & FRIENDS LISTENER
// ==========================================
function initDmsListener() {
  // Clear any existing active page listener unsubscribes
  activeUnsubscribes.forEach(unsub => unsub());
  activeUnsubscribes = [];

  if (!currentUser) {
    checkUserProfile();
    return;
  }

  // Subscribe to all users
  const unsubUsers = DB.listenUsers((users) => {
    allUsers = users;
    renderFriendsDirectory();
    renderConversations();
  });

  // Subscribe to friendships
  const unsubFriendships = DB.listenFriendships(currentUser.uid, (friendships) => {
    allFriendships = friendships;
    renderFriendsDirectory();
    renderConversations();
    updateUnreadBadges();
  });

  activeUnsubscribes.push(unsubUsers, unsubFriendships);
}

// Render User Directory with Friend Request Actions
function renderFriendsDirectory() {
  const container = document.getElementById('friends-directory-list');
  const searchInput = document.getElementById('find-friends-input');
  if (!container) return;

  const searchQuery = searchInput ? searchInput.value.toLowerCase().trim() : '';

  // Filter out ourselves and match search query
  const filteredUsers = allUsers.filter(u => {
    if (!currentUser || u.uid === currentUser.uid) return false;
    if (searchQuery && !u.nickname.toLowerCase().includes(searchQuery)) return false;
    return true;
  });

  if (filteredUsers.length === 0) {
    container.innerHTML = `
      <div class="text-center py-6 text-slate-400 text-[10px] font-semibold uppercase tracking-wider">
        No students found
      </div>
    `;
    return;
  }

  container.innerHTML = '';
  filteredUsers.forEach(u => {
    const userRow = document.createElement('div');
    userRow.className = 'flex items-center justify-between p-2 bg-slate-50 border border-slate-100 rounded-lg gap-2 text-xs';

    const info = document.createElement('div');
    info.className = 'flex items-center gap-1.5 overflow-hidden';
    
    const avatar = document.createElement('span');
    avatar.className = 'avatar-circle-sm shrink-0';
    setAvatarElement(avatar, u.avatar);

    const name = document.createElement('span');
    name.className = 'font-bold text-slate-700 truncate';
    name.textContent = u.nickname;

    info.appendChild(avatar);
    info.appendChild(name);
    userRow.appendChild(info);

    // Determine status relative to this user
    const friendship = allFriendships.find(f => f.users.includes(u.uid));
    
    const actionBtn = document.createElement('button');
    if (friendship) {
      if (friendship.status === 'accepted') {
        actionBtn.className = 'cartoon-btn btn-purple px-2 py-1 text-[9px] font-bold';
        actionBtn.textContent = 'Chat 💬';
        actionBtn.addEventListener('click', () => {
          openPrivateChat(friendship.id, u);
        });
      } else if (friendship.status === 'pending') {
        if (friendship.senderId === currentUser.uid) {
          actionBtn.className = 'cartoon-btn btn-white px-2 py-1 text-[9px] font-bold border-slate-200 text-slate-400 cursor-not-allowed';
          actionBtn.textContent = 'Sent 🕒';
          actionBtn.disabled = true;
        } else {
          actionBtn.className = 'cartoon-btn btn-yellow px-2 py-1 text-[9px] font-bold';
          actionBtn.textContent = 'Accept ✅';
          actionBtn.addEventListener('click', async () => {
            actionBtn.disabled = true;
            try {
              await DB.acceptFriendRequest(currentUser.uid, u.uid);
              showToast('🤝', `You are now friends with ${u.nickname}!`);
            } catch (err) {
              console.error(err);
            }
          });
        }
      }
    } else {
      actionBtn.className = 'cartoon-btn btn-white px-2 py-1 text-[9px] font-bold';
      actionBtn.textContent = 'Add Friend ➕';
      actionBtn.addEventListener('click', async () => {
        actionBtn.disabled = true;
        try {
          await DB.sendFriendRequest(currentUser.uid, u.uid);
          showToast('✉️', `Friend request sent to ${u.nickname}!`);
        } catch (err) {
          console.error(err);
        }
      });
    }

    userRow.appendChild(actionBtn);
    container.appendChild(userRow);
  });
}

// Render conversations from accepted friendships
function renderConversations() {
  const container = document.getElementById('dm-conversations-list');
  if (!container) return;

  const acceptedFriendships = allFriendships.filter(f => f.status === 'accepted');

  if (acceptedFriendships.length === 0) {
    container.innerHTML = `
      <div class="text-center py-8 text-xs text-slate-400 font-semibold leading-normal max-w-[180px] mx-auto">
        No active chats. Add friends in the directory to start!
      </div>
    `;
    return;
  }

  container.innerHTML = '';
  acceptedFriendships.forEach(f => {
    // Find the other user uid
    const otherUid = f.users.find(id => id !== currentUser.uid);
    const friend = allUsers.find(u => u.uid === otherUid);

    if (!friend) return;

    const chatRow = document.createElement('div');
    const isActive = activeDmFriendshipId === f.id;
    chatRow.className = `flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors border ${
      isActive ? 'bg-purple-50 border-purple-100' : 'bg-slate-50/50 hover:bg-slate-50 border-transparent'
    }`;

    const avatar = document.createElement('span');
    avatar.className = 'avatar-circle-sm shrink-0';
    setAvatarElement(avatar, friend.avatar);

    const details = document.createElement('div');
    details.className = 'flex-1 overflow-hidden leading-tight';

    const name = document.createElement('span');
    name.className = 'font-bold text-slate-700 text-xs block truncate';
    name.textContent = friend.nickname;
    
    const handle = document.createElement('span');
    handle.className = 'text-[9px] text-slate-400 block truncate';
    handle.textContent = `@${friend.nickname.toLowerCase().replace(/\s+/g, '')}`;

    details.appendChild(name);
    details.appendChild(handle);
    chatRow.appendChild(avatar);
    chatRow.appendChild(details);

    chatRow.addEventListener('click', () => {
      openPrivateChat(f.id, friend);
      renderConversations(); // update active styling
    });

    container.appendChild(chatRow);
  });
}

// Open Private Chat Room with a friend
function openPrivateChat(chatId, friend) {
  activeDmFriendshipId = chatId;
  activeDmFriend = friend;

  document.getElementById('dm-chat-placeholder').classList.add('hidden');
  const activeWindow = document.getElementById('dm-chat-active-window');
  activeWindow.classList.remove('hidden');

  // Update header
  setAvatarElement(document.getElementById('dm-active-avatar'), friend.avatar);
  document.getElementById('dm-active-nickname').textContent = friend.nickname;

  const messagesContainer = document.getElementById('dm-messages-container');
  messagesContainer.innerHTML = `
    <div class="text-center py-6 text-slate-400 text-xs font-semibold">
      Connecting to private chat...
    </div>
  `;

  if (window.unsubActivePrivateChat) {
    window.unsubActivePrivateChat();
  }

  window.unsubActivePrivateChat = DB.listenPrivateMessages(chatId, (messages) => {
    messagesContainer.innerHTML = '';
    if (messages.length === 0) {
      messagesContainer.innerHTML = `
        <div class="text-center py-8 text-slate-400 text-[10px] font-semibold uppercase tracking-wider leading-relaxed max-w-xs mx-auto">
          👋 Start of private chat. Send a message to say hello!
        </div>
      `;
      return;
    }

    messages.forEach(msg => {
      const isMe = msg.senderId === currentUser.uid;
      const bubbleWrap = document.createElement('div');
      bubbleWrap.className = `flex gap-2.5 max-w-full ${isMe ? 'flex-row-reverse self-end' : 'self-start'}`;

      const avatarBox = renderAvatarHTML(msg.senderAvatar, 'avatar-circle-sm self-end shadow-sm bg-white');
      
      const speechBubble = `
        <div class="flex flex-col ${isMe ? 'items-end' : 'items-start'}">
          <span class="text-[10px] font-bold text-slate-400 mb-0.5 px-1">${msg.senderName}</span>
          <div class="speech-bubble ${isMe ? 'speech-bubble-purple' : 'speech-bubble-left bg-slate-100 border-slate-200 text-slate-800'}">
            <p class="text-xs break-words">${msg.content}</p>
            <div class="chat-file-container mt-1"></div>
          </div>
          <span class="text-[9px] text-slate-400 mt-0.5 px-1">${formatTime(msg.timestamp)}</span>
        </div>
      `;

      bubbleWrap.innerHTML = isMe ? `${speechBubble}${avatarBox}` : `${avatarBox}${speechBubble}`;

      if (msg.file) {
        const fileContainer = bubbleWrap.querySelector('.chat-file-container');
        if (fileContainer) {
          fileContainer.appendChild(renderFileAttachment(msg.file, isMe));
        }
      }

      messagesContainer.appendChild(bubbleWrap);
    });

    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  });
}

// Update badges for friend requests & unread items
function updateUnreadBadges() {
  const reqBadge = document.getElementById('friend-requests-badge');
  if (!reqBadge) return;

  const pendingRequests = allFriendships.filter(f => f.status === 'pending' && f.senderId !== currentUser.uid);
  
  if (pendingRequests.length > 0) {
    reqBadge.textContent = pendingRequests.length;
    reqBadge.classList.remove('hidden');
  } else {
    reqBadge.classList.add('hidden');
  }
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


  // Profile auth triggers
  checkUserProfile();

  // Default page setup
  initFeedListener();

  // Screen menu toggles
  const btnFeed = document.getElementById('nav-feed');
  const btnCommunities = document.getElementById('nav-communities');
  const btnDms = document.getElementById('nav-dms');
  const screenFeed = document.getElementById('screen-feed');
  const screenComms = document.getElementById('screen-communities');
  const screenActiveComm = document.getElementById('screen-active-community');
  const screenDms = document.getElementById('screen-dms');

  const selectTab = (tab) => {
    // Desktop tabs active class toggle
    btnFeed.classList.toggle('active', tab === 'feed');
    btnCommunities.classList.toggle('active', tab === 'communities');
    if (btnDms) btnDms.classList.toggle('active', tab === 'dms');
    
    // Mobile bottom tabs selectors
    const mobFeed = document.getElementById('mobile-nav-feed');
    const mobComms = document.getElementById('mobile-nav-communities');
    const mobDms = document.getElementById('mobile-nav-dms');
    
    if (mobFeed) mobFeed.className = `flex flex-col items-center gap-0.5 ${tab === 'feed' ? 'text-indigo-600' : 'text-slate-400'}`;
    if (mobComms) mobComms.className = `flex flex-col items-center gap-0.5 ${tab === 'communities' ? 'text-indigo-600' : 'text-slate-400'}`;
    if (mobDms) mobDms.className = `flex flex-col items-center gap-0.5 ${tab === 'dms' ? 'text-indigo-600' : 'text-slate-400'}`;
    
    // Toggle screens
    screenFeed.classList.toggle('hidden', tab !== 'feed');
    screenComms.classList.toggle('hidden', tab !== 'communities');
    if (screenDms) screenDms.classList.toggle('hidden', tab !== 'dms');
    screenActiveComm.classList.add('hidden'); // Always hide active community

    if (tab === 'feed') {
      initFeedListener();
    } else if (tab === 'communities') {
      initCommunitiesListener();
    } else if (tab === 'dms') {
      initDmsListener();
    }
  };

  btnFeed.addEventListener('click', () => selectTab('feed'));
  btnCommunities.addEventListener('click', () => selectTab('communities'));
  if (btnDms) btnDms.addEventListener('click', () => selectTab('dms'));
  
  // Mobile Nav tab listeners
  const mobFeed = document.getElementById('mobile-nav-feed');
  const mobComms = document.getElementById('mobile-nav-communities');
  const mobDms = document.getElementById('mobile-nav-dms');
  if (mobFeed) mobFeed.addEventListener('click', () => selectTab('feed'));
  if (mobComms) mobComms.addEventListener('click', () => selectTab('communities'));
  if (mobDms) mobDms.addEventListener('click', () => selectTab('dms'));

  // Mobile Top Header Actions
  const mobProfileBtn = document.getElementById('mobile-profile-btn');
  
  if (mobProfileBtn) {
    mobProfileBtn.addEventListener('click', () => {
      document.getElementById('change-profile-btn').click();
    });
  }

  // Edit profile button
  document.getElementById('change-profile-btn').addEventListener('click', () => {
    const authModal = document.getElementById('auth-modal');
    const inputNickname = document.getElementById('input-nickname');
    const customPreview = document.getElementById('custom-avatar-preview');
    
    if (currentUser) {
      inputNickname.value = currentUser.nickname;
      selectedAvatar = currentUser.avatar;
      
      // Update custom preview
      const isUrl = selectedAvatar.startsWith('http://') || selectedAvatar.startsWith('https://');
      if (isUrl && customPreview) {
        customPreview.innerHTML = `<img src="${selectedAvatar}" class="w-full h-full object-cover rounded-full" />`;
      } else if (customPreview) {
        customPreview.innerHTML = `<span>None</span>`;
      }

      // Highlight selected sticker option if any
      document.querySelectorAll('.avatar-option').forEach(btn => {
        if (btn.getAttribute('data-avatar') === selectedAvatar) {
          btn.className = 'avatar-option cartoon-btn btn-yellow py-2 text-2xl rounded-lg border-yellow-300';
        } else {
          btn.className = 'avatar-option cartoon-btn btn-white py-2 text-2xl rounded-lg';
        }
      });
    } else {
      selectedAvatar = '🦊';
      if (customPreview) customPreview.innerHTML = `<span>None</span>`;
      document.querySelectorAll('.avatar-option').forEach(btn => {
        btn.className = btn.getAttribute('data-avatar') === '🦊' 
          ? 'avatar-option cartoon-btn btn-yellow py-2 text-2xl rounded-lg border-yellow-300'
          : 'avatar-option cartoon-btn btn-white py-2 text-2xl rounded-lg';
      });
    }
    authModal.classList.remove('hidden');
  });

  // Profile Selection Logic
  let selectedAvatar = '🦊';
  document.querySelectorAll('.avatar-option').forEach(btn => {
    btn.addEventListener('click', (e) => {
      // Clear custom photo preview
      const customPreview = document.getElementById('custom-avatar-preview');
      if (customPreview) customPreview.innerHTML = `<span>None</span>`;
      
      document.querySelectorAll('.avatar-option').forEach(b => b.className = 'avatar-option cartoon-btn btn-white py-2 text-2xl rounded-lg');
      e.currentTarget.className = 'avatar-option cartoon-btn btn-yellow py-2 text-2xl rounded-lg border-yellow-300';
      selectedAvatar = e.currentTarget.getAttribute('data-avatar');
    });
  });

  // Custom Avatar Photo Upload handler
  const avatarFileInput = document.getElementById('input-avatar-file');
  const avatarUploadStatus = document.getElementById('avatar-upload-status');
  const customAvatarPreview = document.getElementById('custom-avatar-preview');
  
  if (avatarFileInput) {
    avatarFileInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      avatarFileInput.disabled = true;
      if (avatarUploadStatus) avatarUploadStatus.classList.remove('hidden');

      try {
        const fileDetails = await uploadFileToTelegram(file);
        selectedAvatar = fileDetails.url;

        // Clear highlight from sticker list
        document.querySelectorAll('.avatar-option').forEach(b => b.className = 'avatar-option cartoon-btn btn-white py-2 text-2xl rounded-lg');
        
        // Show in custom preview
        if (customAvatarPreview) {
          customAvatarPreview.innerHTML = `<img src="${selectedAvatar}" class="w-full h-full object-cover rounded-full" />`;
        }
        showToast('🖼️', 'Profile picture uploaded successfully!');
      } catch (err) {
        console.error(err);
        showToast('❌', err.message || 'Failed to upload photo.');
      } finally {
        avatarFileInput.disabled = false;
        avatarFileInput.value = '';
        if (avatarUploadStatus) avatarUploadStatus.classList.add('hidden');
      }
    });
  }

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
    try {
      await signOut(DB.auth);
    } catch (e) {
      console.error("Firebase SignOut error:", e);
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

  // Feed File Attachment Handling
  let feedAttachedFile = null;
  const feedFileInput = document.getElementById('feed-file-input');
  const feedUploadProgress = document.getElementById('feed-upload-progress');
  const feedAttachmentPreview = document.getElementById('feed-attachment-preview');
  const feedPreviewName = document.getElementById('feed-preview-name');
  const feedPreviewIcon = document.getElementById('feed-preview-icon');
  const removeFeedAttachmentBtn = document.getElementById('remove-feed-attachment-btn');

  if (feedFileInput) {
    feedFileInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      if (!currentUser) {
        checkUserProfile();
        feedFileInput.value = '';
        return;
      }

      feedFileInput.disabled = true;
      if (feedUploadProgress) feedUploadProgress.classList.remove('hidden');
      if (feedAttachmentPreview) feedAttachmentPreview.classList.add('hidden');

      try {
        const fileDetails = await uploadFileToTelegram(file);
        feedAttachedFile = fileDetails;
        
        if (feedPreviewName) feedPreviewName.textContent = fileDetails.name;
        if (feedPreviewIcon) {
          feedPreviewIcon.textContent = fileDetails.type.startsWith('image/') ? '🖼️' : (fileDetails.type.startsWith('video/') ? '🎥' : '📄');
        }
        if (feedAttachmentPreview) feedAttachmentPreview.classList.remove('hidden');
        showToast('📎', 'File attached successfully!');
      } catch (err) {
        console.error(err);
        showToast('❌', err.message || 'Failed to upload attachment.');
        feedAttachedFile = null;
        if (feedAttachmentPreview) feedAttachmentPreview.classList.add('hidden');
      } finally {
        feedFileInput.disabled = false;
        feedFileInput.value = '';
        if (feedUploadProgress) feedUploadProgress.classList.add('hidden');
      }
    });
  }

  if (removeFeedAttachmentBtn) {
    removeFeedAttachmentBtn.addEventListener('click', () => {
      feedAttachedFile = null;
      if (feedAttachmentPreview) feedAttachmentPreview.classList.add('hidden');
    });
  }

  // Post Submission
  document.getElementById('submit-post-btn').addEventListener('click', async () => {
    const text = postTextarea.value.trim();
    if (!text && !feedAttachedFile) {
      showToast('⚠️', 'Please write something or attach a file before sharing!');
      return;
    }

    if (!currentUser) {
      checkUserProfile();
      return;
    }

    const postBtn = document.getElementById('submit-post-btn');
    postBtn.disabled = true;
    try {
      const postData = {
        nickname: currentUser.nickname,
        avatar: currentUser.avatar,
        mood: selectedMood,
        emoji: selectedEmoji,
        content: text
      };
      if (feedAttachedFile) {
        postData.file = feedAttachedFile;
      }

      await DB.addPost(postData);
      
      postTextarea.value = '';
      charCounter.textContent = '0 / 280 characters';
      feedAttachedFile = null;
      if (feedAttachmentPreview) feedAttachmentPreview.classList.add('hidden');
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

  // Group chat file upload attachment
  const commFileInput = document.getElementById('comm-file-input');
  const commUploadProgress = document.getElementById('comm-upload-progress');
  if (commFileInput) {
    commFileInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file || !activeCommunityId) return;

      if (!currentUser) {
        checkUserProfile();
        commFileInput.value = '';
        return;
      }

      commFileInput.disabled = true;
      if (commUploadProgress) commUploadProgress.classList.remove('hidden');

      try {
        const fileDetails = await uploadFileToTelegram(file);
        // Immediately send as message
        await DB.addChatMessage(activeCommunityId, {
          nickname: currentUser.nickname,
          avatar: currentUser.avatar,
          content: '',
          file: fileDetails
        });
        showToast('📎', 'File shared in group chat!');
      } catch (err) {
        console.error(err);
        showToast('❌', err.message || 'Failed to upload attachment.');
      } finally {
        commFileInput.disabled = false;
        commFileInput.value = '';
        if (commUploadProgress) commUploadProgress.classList.add('hidden');
      }
    });
  }

  // --- DIRECT MESSAGES (DMs) & FRIENDS TAB ROUTINES ---
  
  // Find friends input search query
  const findFriendsInput = document.getElementById('find-friends-input');
  if (findFriendsInput) {
    findFriendsInput.addEventListener('input', () => {
      renderFriendsDirectory();
    });
  }

  // Submit Private Message
  const dmChatInput = document.getElementById('dm-chat-input');
  const sendDmBtn = document.getElementById('send-dm-btn');
  
  const submitPrivateMessage = async () => {
    if (!activeDmFriendshipId) return;
    const text = dmChatInput.value.trim();
    if (!text) return;

    if (!currentUser) {
      checkUserProfile();
      return;
    }

    sendDmBtn.disabled = true;
    try {
      await DB.sendPrivateMessage(activeDmFriendshipId, {
        senderId: currentUser.uid,
        senderName: currentUser.nickname,
        senderAvatar: currentUser.avatar,
        content: text
      });
      dmChatInput.value = '';
    } catch (err) {
      console.error(err);
    } finally {
      sendDmBtn.disabled = false;
    }
  };

  if (sendDmBtn) sendDmBtn.addEventListener('click', submitPrivateMessage);
  if (dmChatInput) {
    dmChatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submitPrivateMessage();
    });
  }

  // Direct Message File Attachment Upload
  const dmFileInput = document.getElementById('dm-file-input');
  const dmUploadProgress = document.getElementById('dm-upload-progress');
  if (dmFileInput) {
    dmFileInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file || !activeDmFriendshipId) return;

      if (!currentUser) {
        checkUserProfile();
        dmFileInput.value = '';
        return;
      }

      dmFileInput.disabled = true;
      if (dmUploadProgress) dmUploadProgress.classList.remove('hidden');

      try {
        const fileDetails = await uploadFileToTelegram(file);
        // Immediately send message with attachment
        await DB.sendPrivateMessage(activeDmFriendshipId, {
          senderId: currentUser.uid,
          senderName: currentUser.nickname,
          senderAvatar: currentUser.avatar,
          content: '',
          file: fileDetails
        });
        showToast('📎', 'File shared in private chat!');
      } catch (err) {
        console.error(err);
        showToast('❌', err.message || 'Failed to upload attachment.');
      } finally {
        dmFileInput.disabled = false;
        dmFileInput.value = '';
        if (dmUploadProgress) dmUploadProgress.classList.add('hidden');
      }
    });
  }

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


});
