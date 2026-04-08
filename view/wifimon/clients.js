'use strict';
'require view';
'require rpc';
'require poll';
'require dom';

var callGetClients = rpc.declare({
	object: 'wifimon',
	method: 'get_clients',
	expect: { clients: [] }
});

var callGetDnsHistory = rpc.declare({
	object: 'wifimon',
	method: 'get_dns_history',
	params: ['ip'],
	expect: { hosts: [] }
});

function formatBytes(bytes) {
	if (bytes === 0) return '0 B';
	var k = 1024;
	var sizes = ['B', 'KB', 'MB', 'GB'];
	var i = Math.floor(Math.log(Math.abs(bytes) || 1) / Math.log(k));
	if (i >= sizes.length) i = sizes.length - 1;
	return (bytes / Math.pow(k, i)).toFixed(1) + ' ' + sizes[i];
}

function formatSpeed(bytesPerSec) {
	if (!bytesPerSec || bytesPerSec <= 0) return '0 B/s';
	return formatBytes(bytesPerSec) + '/s';
}

function formatTime(seconds) {
	if (!seconds || seconds <= 0) return '-';
	var d = Math.floor(seconds / 86400);
	var h = Math.floor((seconds % 86400) / 3600);
	var m = Math.floor((seconds % 3600) / 60);
	if (d > 0) return d + '\u0434 ' + h + '\u0447';
	if (h > 0) return h + '\u0447 ' + m + '\u043c';
	return m + '\u043c';
}

function signalIcon(signal) {
	var s = parseInt(signal) || -100;
	if (s >= -50) return '\u2582\u2584\u2586\u2588';
	if (s >= -60) return '\u2582\u2584\u2586\u2591';
	if (s >= -70) return '\u2582\u2584\u2591\u2591';
	return '\u2582\u2591\u2591\u2591';
}

function signalColor(signal) {
	var s = parseInt(signal) || -100;
	if (s >= -50) return '#4caf50';
	if (s >= -60) return '#8bc34a';
	if (s >= -70) return '#ff9800';
	return '#f44336';
}

return view.extend({
	title: _('WiFi Monitor'),

	handleSaveApply: null,
	handleSave: null,
	handleReset: null,

	load: function() {
		return callGetClients();
	},

	render: function(initialClients) {
		var openDnsMac = null;
		// cards[mac] = { card: Element, refs: {field: Element}, dnsDiv: Element }
		var cards = {};

		var css = E('style', {}, [
			'.wifimon-wrap { font-family: sans-serif; }',
			'.wifimon-card { background: #fff; border: 1px solid #ddd; border-radius: 8px; margin: 8px 0; padding: 14px 18px; cursor: pointer; transition: box-shadow 0.2s; }',
			'.wifimon-card:hover { box-shadow: 0 2px 8px rgba(0,0,0,0.12); }',
			'.wifimon-card-header { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; }',
			'.wifimon-name { font-weight: bold; font-size: 15px; }',
			'.wifimon-mac { color: #888; font-size: 12px; font-family: monospace; }',
			'.wifimon-ip { color: #555; font-size: 13px; }',
			'.wifimon-band { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: bold; color: #fff; }',
			'.wifimon-band-5 { background: #2196f3; }',
			'.wifimon-band-2 { background: #9c27b0; }',
			'.wifimon-stats { display: flex; gap: 20px; margin-top: 8px; flex-wrap: wrap; font-size: 13px; color: #555; }',
			'.wifimon-stat { display: flex; align-items: center; gap: 4px; }',
			'.wifimon-stat b { color: #333; }',
			'.wifimon-signal { font-family: monospace; letter-spacing: -1px; }',
			'.wifimon-speed { font-weight: bold; }',
			'.wifimon-speed-down { color: #4caf50; }',
			'.wifimon-speed-up { color: #2196f3; }',
			'.wifimon-dns { margin-top: 10px; padding: 10px 14px; background: #f5f5f5; border-radius: 6px; display: none; }',
			'.wifimon-dns.open { display: block; }',
			'.wifimon-dns-title { font-weight: bold; font-size: 13px; margin-bottom: 6px; color: #333; }',
			'.wifimon-dns-list { list-style: none; padding: 0; margin: 0; }',
			'.wifimon-dns-list li { padding: 3px 0; font-size: 13px; color: #555; border-bottom: 1px solid #eee; font-family: monospace; }',
			'.wifimon-dns-list li:last-child { border: none; }',
			'.wifimon-dns-loading { color: #999; font-style: italic; font-size: 13px; }',
			'.wifimon-count { background: #f0f0f0; padding: 6px 14px; border-radius: 6px; margin-bottom: 10px; font-size: 14px; color: #333; }',
			'.wifimon-empty { text-align: center; color: #999; padding: 40px; font-size: 15px; }'
		].join('\n'));

		var container = E('div', { 'class': 'wifimon-wrap' }, [css]);
		var countDiv = E('div', { 'class': 'wifimon-count' });
		var listDiv = E('div', { 'id': 'wifimon-list' });
		container.appendChild(countDiv);
		container.appendChild(listDiv);

		function fetchDns(ip, dnsDiv) {
			dom.content(dnsDiv, [
				E('div', { 'class': 'wifimon-dns-title' }, 'Последние DNS-запросы:'),
				E('div', { 'class': 'wifimon-dns-loading' }, 'Загрузка...')
			]);
			callGetDnsHistory(ip).then(function(hosts) {
				var content = [
					E('div', { 'class': 'wifimon-dns-title' },
						'Последние DNS-запросы (' + ip + '):')
				];
				if (hosts && hosts.length) {
					var ul = E('ul', { 'class': 'wifimon-dns-list' });
					hosts.forEach(function(h) { ul.appendChild(E('li', {}, h)); });
					content.push(ul);
				} else {
					content.push(E('div', { 'class': 'wifimon-dns-loading' }, 'Нет данных'));
				}
				dom.content(dnsDiv, content);
			}).catch(function() {
				dom.content(dnsDiv, [
					E('div', { 'class': 'wifimon-dns-title' }, 'Последние DNS-запросы:'),
					E('div', { 'class': 'wifimon-dns-loading' }, 'Ошибка загрузки')
				]);
			});
		}

		// Create a new card for a client, return { card, refs, dnsDiv }
		function createCard(client) {
			var mac = client.mac;
			var refs = {};

			var dnsDiv = E('div', { 'class': 'wifimon-dns' });

			refs.name = E('span', { 'class': 'wifimon-name' });
			refs.macSpan = E('span', { 'class': 'wifimon-mac' });
			refs.ip = E('span', { 'class': 'wifimon-ip' });
			refs.band = E('span', { 'class': 'wifimon-band' });
			refs.signalIcon = E('span', { 'class': 'wifimon-signal' });
			refs.signalText = E('span', {});
			// iw tx = router sends to client = client download (↓)
			// iw rx = router gets from client = client upload (↑)
			refs.dlSpeed = E('span', { 'class': 'wifimon-speed wifimon-speed-down' });
			refs.ulSpeed = E('span', { 'class': 'wifimon-speed wifimon-speed-up' });
			refs.rxRate = E('b', {});
			refs.txRate = E('b', {});
			refs.dlTotal = E('b', {});
			refs.ulTotal = E('b', {});
			refs.uptime = E('b', {});

			var card = E('div', { 'class': 'wifimon-card', 'data-mac': mac }, [
				E('div', { 'class': 'wifimon-card-header' }, [
					E('div', {}, [refs.name, refs.macSpan]),
					E('div', { 'style': 'display:flex; align-items:center; gap:10px;' }, [
						refs.ip, refs.band
					])
				]),
				E('div', { 'class': 'wifimon-stats' }, [
					E('span', { 'class': 'wifimon-stat' }, [refs.signalIcon, refs.signalText]),
					E('span', { 'class': 'wifimon-stat' }, ['\u2193 ', refs.dlSpeed]),
					E('span', { 'class': 'wifimon-stat' }, ['\u2191 ', refs.ulSpeed]),
					E('span', { 'class': 'wifimon-stat' }, ['RX: ', refs.rxRate]),
					E('span', { 'class': 'wifimon-stat' }, ['TX: ', refs.txRate]),
					E('span', { 'class': 'wifimon-stat' }, ['Всего \u2193 ', refs.dlTotal]),
					E('span', { 'class': 'wifimon-stat' }, ['Всего \u2191 ', refs.ulTotal]),
					E('span', { 'class': 'wifimon-stat' }, ['Онлайн: ', refs.uptime]),
				]),
				dnsDiv
			]);

			card.addEventListener('click', function(ev) {
				ev.stopPropagation();

				if (openDnsMac === mac) {
					dnsDiv.classList.remove('open');
					openDnsMac = null;
					return;
				}

				// Close previous
				if (openDnsMac && cards[openDnsMac]) {
					cards[openDnsMac].dnsDiv.classList.remove('open');
				}

				openDnsMac = mac;
				dnsDiv.classList.add('open');

				var curIp = card.getAttribute('data-ip');
				if (curIp && curIp !== 'N/A') {
					fetchDns(curIp, dnsDiv);
				}
			});

			return { card: card, refs: refs, dnsDiv: dnsDiv };
		}

		// Update an existing card's displayed values
		function updateCard(entry, client) {
			var r = entry.refs;
			var hasName = client.hostname && client.hostname !== 'unknown';

			r.name.textContent = hasName ? client.hostname : client.mac;
			r.macSpan.textContent = hasName ? ' (' + client.mac + ')' : '';
			r.ip.textContent = client.ip || '';
			r.band.textContent = client.band;
			r.band.className = 'wifimon-band ' + (client.band === '5GHz' ? 'wifimon-band-5' : 'wifimon-band-2');

			r.signalIcon.textContent = signalIcon(client.signal);
			r.signalIcon.style.color = signalColor(client.signal);
			r.signalText.textContent = ' ' + client.signal + ' dBm';

			// iw tx_speed = router->client = download for client (↓)
			// iw rx_speed = client->router = upload for client (↑)
			r.dlSpeed.textContent = formatSpeed(client.tx_speed);
			r.ulSpeed.textContent = formatSpeed(client.rx_speed);
			r.rxRate.textContent = client.rx_bitrate || '-';
			r.txRate.textContent = client.tx_bitrate || '-';
			r.dlTotal.textContent = formatBytes(client.tx_bytes);
			r.ulTotal.textContent = formatBytes(client.rx_bytes);
			r.uptime.textContent = formatTime(client.connected_time);

			entry.card.setAttribute('data-ip', client.ip || '');
		}

		function renderClients(data) {
			var count = data ? data.length : 0;
			countDiv.textContent = 'Подключено устройств: ' + count;

			if (data && data.length) {
				data.sort(function(a, b) {
					if (a.band !== b.band) return a.band === '5GHz' ? -1 : 1;
					return (b.signal || -100) - (a.signal || -100);
				});
			}

			if (!count) {
				// Remove all cards
				Object.keys(cards).forEach(function(m) {
					if (cards[m].card.parentNode) cards[m].card.parentNode.removeChild(cards[m].card);
					delete cards[m];
				});
				if (!listDiv.querySelector('.wifimon-empty')) {
					listDiv.appendChild(E('div', { 'class': 'wifimon-empty' }, 'Нет подключённых устройств'));
				}
				openDnsMac = null;
				return;
			}

			// Remove empty placeholder if present
			var emptyEl = listDiv.querySelector('.wifimon-empty');
			if (emptyEl) emptyEl.parentNode.removeChild(emptyEl);

			// Build set of current MACs
			var currentMacs = {};
			data.forEach(function(c) { currentMacs[c.mac] = true; });

			// Remove cards for disconnected clients
			Object.keys(cards).forEach(function(m) {
				if (!currentMacs[m]) {
					if (cards[m].card.parentNode) cards[m].card.parentNode.removeChild(cards[m].card);
					delete cards[m];
					if (openDnsMac === m) openDnsMac = null;
				}
			});

			// Create or update cards, and reorder
			var prevNode = null;
			data.forEach(function(client) {
				var mac = client.mac;
				var entry = cards[mac];

				if (!entry) {
					entry = createCard(client);
					cards[mac] = entry;
				}

				updateCard(entry, client);

				// Ensure correct order in DOM
				var cardEl = entry.card;
				if (prevNode) {
					if (prevNode.nextSibling !== cardEl) {
						listDiv.insertBefore(cardEl, prevNode.nextSibling);
					}
				} else {
					if (listDiv.firstChild !== cardEl) {
						listDiv.insertBefore(cardEl, listDiv.firstChild);
					}
				}
				prevNode = cardEl;
			});
		}

		renderClients(initialClients);

		poll.add(function() {
			return callGetClients().then(function(data) {
				renderClients(data);
			});
		}, 5);

		return container;
	}
});
