self.addEventListener('install', (event) => {
  self.skipWaiting();
  console.log('Service Worker do RioBus instalado.');
});

self.addEventListener('activate', (event) => {
  console.log('Service Worker ativado e pronto para alarmes.');
});

// Escuta a ordem do painel para disparar o alarme
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'DISPARAR_ALARME') {
    const opcoes = {
      body: event.data.mensagem || 'É hora de ir para o ponto de ônibus!',
      icon: 'https://cdn-icons-png.flaticon.com/512/3448/3448339.png',
      vibrate: [300, 100, 300, 100, 300, 100, 1000], // Vibração longa de urgência
      requireInteraction: true // A notificação não some até você tocar
    };

    event.waitUntil(
      self.registration.showNotification('RioBus: Hora de Sair!', opcoes)
    );
  }
});
