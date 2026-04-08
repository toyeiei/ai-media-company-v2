const GITHUB_RAW_BASE = 'https://raw.githubusercontent.com/toyeiei/discord-ai-content-team/main';
const BLOG_PATH = 'blog';

const converter = new showdown.Converter();

let posts = [];

// DOM Elements
const postsContainer = document.getElementById('posts-container');
const modal = document.getElementById('modal');
const modalTitle = document.getElementById('modal-title');
const modalDate = document.getElementById('modal-date');
const modalText = document.getElementById('modal-text');
const modalClose = document.querySelector('.modal-close');
const modalBackdrop = document.querySelector('.modal-backdrop');

// Initialize
document.addEventListener('DOMContentLoaded', loadPosts);

// Event Listeners
modalClose.addEventListener('click', closeModal);
modalBackdrop.addEventListener('click', closeModal);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !modal.classList.contains('hidden')) {
    closeModal();
  }
});

async function loadPosts() {
  try {
    postsContainer.innerHTML = '<div class="loading">Loading posts...</div>';
    
    const response = await fetch(`${GITHUB_RAW_BASE}/${BLOG_PATH}/index.json`);
    if (!response.ok) {
      throw new Error('Failed to load posts');
    }
    
    posts = await response.json();
    
    // Sort by date descending (newest first)
    posts.sort((a, b) => new Date(b.date) - new Date(a.date));
    
    renderPosts();
  } catch (error) {
    console.error('Error loading posts:', error);
    postsContainer.innerHTML = '<div class="error">Failed to load posts. Please try again later.</div>';
  }
}

function renderPosts() {
  if (posts.length === 0) {
    postsContainer.innerHTML = '<div class="empty">No posts yet. Check back soon!</div>';
    return;
  }
  
  postsContainer.innerHTML = posts.map(post => `
    <article class="post-card" data-slug="${post.slug}">
      <span class="topic">${escapeHtml(post.topic || 'General')}</span>
      <h3>${escapeHtml(post.title)}</h3>
      <p class="excerpt">${escapeHtml(post.excerpt)}</p>
      <p class="date">${formatDate(post.date)}</p>
    </article>
  `).join('');
  
  // Add click listeners
  document.querySelectorAll('.post-card').forEach(card => {
    card.addEventListener('click', () => openPost(card.dataset.slug));
  });
}

async function openPost(slug) {
  try {
    const response = await fetch(`${GITHUB_RAW_BASE}/${BLOG_PATH}/${slug}.md`);
    if (!response.ok) {
      throw new Error('Failed to load post content');
    }
    
    const markdown = await response.text();
    const html = converter.makeHtml(markdown);
    
    const post = posts.find(p => p.slug === slug);
    
    modalTitle.textContent = post.title;
    modalDate.textContent = formatDate(post.date);
    modalText.innerHTML = html;
    
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  } catch (error) {
    console.error('Error opening post:', error);
    alert('Failed to load post content. Please try again.');
  }
}

function closeModal() {
  modal.classList.add('hidden');
  document.body.style.overflow = '';
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatDate(dateStr) {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}
