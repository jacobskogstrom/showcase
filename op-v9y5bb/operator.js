/* OPERATOR — shared catalog + order state (concept, localStorage only, no backend) */

const OP = {
  BASE_PRICE: 195, // kr/mo — includes Chat & memory + Todos & notes

  SCOOPS: [
    { id: 'brief',    icon: '🌅', name: 'Morning brief',      price: 49, desc: 'Your day — meetings, priorities, weather — pushed before you wake.' },
    { id: 'mail',     icon: '📬', name: 'Mail digest',        price: 59, desc: 'Twice-daily summary of mail that actually matters. Invoices, people, deadlines.' },
    { id: 'calendar', icon: '📅', name: 'Calendar concierge', price: 59, desc: 'Book, move and invite by chat. Conflicts checked before anything lands.' },
    { id: 'contacts', icon: '🤝', name: 'Contact memory',     price: 49, desc: '"Lunch with Anna" — logged, remembered, follow-up drafted. Never lose a thread.' },
    { id: 'email',    icon: '✉️', name: 'Email that sends',   price: 79, desc: 'Drafts in your voice — and actually sends them, signed by your assistant.' },
    { id: 'scanner',  icon: '📡', name: 'Market scanner',     price: 69, desc: 'Daily scan of job boards, prices or topics you choose. Only new hits reach you.' },
    { id: 'content',  icon: '🌙', name: 'Content factory',    price: 99, desc: 'Drop an idea by day. Wake up to a drafted post, page or script.' },
    { id: 'media',    icon: '🎨', name: 'Visuals on demand',  price: 69, desc: 'On-brand images and diagrams from one line of chat.' },
    { id: 'voice',    icon: '🎙️', name: 'Voice',              price: 49, desc: 'Talk instead of type. Same operator, hands-free.' },
    { id: 'family',   icon: '🏡', name: 'Family & household', price: 59, desc: 'Family map, shared lists, home values. One assistant for the whole house.' },
  ],

  PLANS: {
    starter:   { name: 'Starter',   price: 195, includes: [] },
    assistant: { name: 'Assistant', price: 395, includes: ['brief', 'mail', 'calendar', 'contacts'] },
    operator:  { name: 'Operator',  price: 695, includes: ['brief', 'mail', 'calendar', 'contacts', 'email', 'scanner', 'content', 'media', 'voice', 'family'] },
  },

  scoop(id) { return this.SCOOPS.find(s => s.id === id); },

  getOrder() {
    try { return JSON.parse(localStorage.getItem('operatorOrder')) || null; }
    catch (e) { return null; }
  },
  setOrder(order) { localStorage.setItem('operatorOrder', JSON.stringify(order)); },

  // total for a custom scoop selection
  customTotal(ids) {
    return this.BASE_PRICE + ids.reduce((sum, id) => sum + (this.scoop(id) ? this.scoop(id).price : 0), 0);
  },

  // cheapest way to get a custom selection: à la carte vs a plan that covers it
  bestDeal(ids) {
    const alc = this.customTotal(ids);
    const options = [{ kind: 'custom', label: 'Your mix', price: alc }];
    for (const key of ['assistant', 'operator']) {
      const plan = this.PLANS[key];
      if (ids.every(id => plan.includes.includes(id))) {
        options.push({ kind: key, label: plan.name + ' plan', price: plan.price });
      }
    }
    options.sort((a, b) => a.price - b.price);
    return { alc, best: options[0] };
  },

  kr(n) { return n.toLocaleString('sv-SE') + ' kr/mo'; },
};

/* reveal-on-scroll — with safety net: nothing may stay hidden if the observer
   never fires (headless capture, reduced motion, IO failure) */
document.addEventListener('DOMContentLoaded', () => {
  const els = [...document.querySelectorAll('.reveal')];
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) {
    els.forEach(el => el.classList.add('in'));
    return;
  }
  const io = new IntersectionObserver(es => es.forEach(e => {
    if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
  }), { threshold: 0.12 });
  els.forEach(el => io.observe(el));
  setTimeout(() => els.forEach(el => el.classList.add('in')), 1100);
});
