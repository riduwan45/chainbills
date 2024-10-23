import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useTimeStore = defineStore('time', () => {
  const getDisplay = (when: number) => {
    const now = Math.round(Date.now() / 1000);
    if (now - 60 < when) return 'Just Now';

    const date = new Date(when * 1000);
    if (now - 60 * 60 < when) {
      const currentHour = new Date().getHours();
      if (currentHour === date.getHours()) {
        const mins = Math.round((now - when) / 60);
        return `${mins} min${mins > 1 ? 's' : ''} ago`;
      }
    }

    let timeStr = new Intl.DateTimeFormat('en-us', {
      hour12: true,
      hour: 'numeric',
      minute: 'numeric',
    }).format(date);
    // Add leading zero to single-digit hours
    if (timeStr.split(':')[0].length === 1) {
      timeStr = '0' + timeStr;
    }

    const lastMidnight = Math.round(
      new Date(new Date().setHours(0, 0, 0, 0)).getTime() / 1000
    );
    const lastTwoMidnights = lastMidnight - 24 * 60 * 60;
    if (lastTwoMidnights < when) {
      return `${lastMidnight < when ? 'Today' : 'Yesterday'} · ${timeStr}`;
    }

    const dateParts = date.toDateString().split(' ');
    const dateStr = [
      dateParts[2],
      dateParts[1],
      dateParts[3].split('').slice(2).join(''),
    ].join('/');
    return `${dateStr} · ${timeStr}`;
  };

  const display = (when: number) => {
    const displayed = ref(getDisplay(when));

    const lastMidnight = Math.round(
      new Date(new Date().setHours(0, 0, 0, 0)).getTime() / 1000
    );
    const lastTwoMidnights = lastMidnight - 24 * 60 * 60;
    if (lastTwoMidnights < when) {
      // get the number of seconds till the next minute from now
      const seconds = 60 - (Math.round(Date.now() / 1000) % 60);
      // update the displayed value after the next minute for every minute
      setTimeout(() => {
        displayed.value = getDisplay(when);
        setInterval(() => (displayed.value = getDisplay(when)), 60 * 1000);
      }, seconds);
    }

    return displayed;
  };

  return { display };
});
