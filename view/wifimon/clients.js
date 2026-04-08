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

	render: function(clients) {
		// State: which MAC's DNS panel is open (persists across polls)
		var openDnsMac = null;
		// Cache of DNS panel DOM nodes keyed by MAC
		var dnsPanels = {};

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

		function fetchDns(mac, ip, dnsDiv) {
			dom.content(dnsDiv, [
				E('div', { 'class': 'wifimon-dns-title' }, '\u041f\u043e\u0441\u043b\u0435\u0434\u043d\u0438\u0435 DNS-\u0437\u0430\u043f\u0440\u043e\u0441\u044b:'),
				E('div', { 'class': 'wifimon-dns-loading' }, '\u0417\u0430\u0433\u0440\u0443\u0437\u043a\u0430...')
			]);

			callGetDnsHistory(ip).then(function(hosts) {
				var content = [
					E('div', { 'class': 'wifimon-dns-title' },
						'\u041f\u043e\u0441\u043b\u0435\u0434\u043d\u0438\u0435 DNS-\u0437\u0430\u043f\u0440\u043e\u0441\u044b (' + ip + '):')
				];
				if (hosts && hosts.length) {
					var ul = E('ul', { 'class': 'wifimon-dns-list' });
					hosts.forEach(function(h) { ul.appendChild(E('li', {}, h)); });
					content.push(ul);
				} else {
					content.push(E('div', { 'class': 'wifimon-dns-loading' }, '\u041d\u0435\u0442 \u0434\u0430\u043d\u043d\u044b\u0445'));
				}
				dom.content(dnsDiv, content);
			}).catch(function() {
				dom.content(dnsDiv, [
					E('div', { 'class': 'wifimon-dns-title' }, '\u041f\u043e\u0441\u043b\u0435\u0434\u043d\u0438\u0435 DNS-\u0437\u0430\u043f\u0440\u043e\u0441\u044b:'),
					E('div', { 'class': 'wifimon-dns-loading' }, '\u041e\u0448\u0438\u0431\u043a\u0430 \u0437\u0430\u0433\u0440\u0443\u0437\u043a\u0438')
				]);
			});
		}

		function renderClients(data) {
			var count = data ? data.length : 0;
			countDiv.textContent = '\u041f\u043e\u0434\u043a\u043b\u044e\u0447\u0435\u043d\u043e \u0443\u0441\u0442\u0440\u043e\u0439\u0441\u0442\u0432: ' + count;

			if (data && data.length) {
				data.sort(function(a, b) {
					if (a.band !== b.band) return a.band === '5GHz' ? -1 : 1;
					return (b.signal || -100) - (a.signal || -100);
				});
			}

			dom.content(listDiv, []);

			if (!count) {
				listDiv.appendChild(E('div', { 'class': 'wifimon-empty' }, '\u041d\u0435\u0442 \u043f\u043e\u0434\u043a\u043b\u044e\u0447\u0451\u043d\u043d\u044b\u0445 \u0443\u0441\u0442\u0440\u043e\u0439\u0441\u0442\u0432'));
				return;
			}

			data.forEach(function(client) {
				var mac = client.mac;

				// Reuse existing DNS panel or create new one
				var dnsDiv;
				if (dnsPanels[mac]) {
					dnsDiv = dnsPanels[mac];
				} else {
					dnsDiv = E('div', { 'class': 'wifimon-dns' }, [
						E('div', { 'class': 'wifimon-dns-title' }, '\u041f\u043e\u0441\u043b\u0435\u0434\u043d\u0438\u0435 DNS-\u0437\u0430\u043f\u0440\u043e\u0441\u044b:'),
						E('div', { 'class': 'wifimon-dns-loading' }, '\u041d\u0430\u0436\u043c\u0438\u0442\u0435 \u0434\u043b\u044f \u0437\u0430\u0433\u0440\u0443\u0437\u043a\u0438...')
					]);
					dnsPanels[mac] = dnsDiv;
				}

				// Restore open state if this was the open panel
				if (openDnsMac === mac) {
					dnsDiv.classList.add('open');
				} else {
					dnsDiv.classList.remove('open');
				}

				var card = E('div', { 'class': 'wifimon-card' }, [
					E('div', { 'class': 'wifimon-card-header' }, [
						E('div', {}, [
							E('span', { 'class': 'wifimon-name' },
								client.hostname && client.hostname !== 'unknown' ? client.hostname : client.mac),
							client.hostname && client.hostname !== 'unknown'
								? E('span', { 'class': 'wifimon-mac' }, ' (' + client.mac + ')')
								: E('span', {}),
						]),
						E('div', { 'style': 'display:flex; align-items:center; gap:10px;' }, [
							E('span', { 'class': 'wifimon-ip' }, client.ip || ''),
							E('span', {
								'class': 'wifimon-band ' + (client.band === '5GHz' ? 'wifimon-band-5' : 'wifimon-band-2')
							}, client.band),
						])
					]),
					E('div', { 'class': 'wifimon-stats' }, [
						E('span', { 'class': 'wifimon-stat' }, [
							E('span', {
								'class': 'wifimon-signal',
								'style': 'color:' + signalColor(client.signal)
							}, signalIcon(client.signal)),
							E('span', {}, ' ' + client.signal + ' dBm')
						]),
						E('span', { 'class': 'wifimon-stat' }, [
							'\u2193 ',
							E('span', { 'class': 'wifimon-speed wifimon-speed-down' },
								formatSpeed(client.rx_speed))
						]),
						E('span', { 'class': 'wifimon-stat' }, [
							'\u2191 ',
							E('span', { 'class': 'wifimon-speed wifimon-speed-up' },
								formatSpeed(client.tx_speed))
						]),
						E('span', { 'class': 'wifimon-stat' }, [
							'RX: ', E('b', {}, client.rx_bitrate || '-')
						]),
						E('span', { 'class': 'wifimon-stat' }, [
							'TX: ', E('b', {}, client.tx_bitrate || '-')
						]),
						E('span', { 'class': 'wifimon-stat' }, [
							'\u0412\u0441\u0435\u0433\u043e \u2193 ', E('b', {}, formatBytes(client.rx_bytes))
						]),
						E('span', { 'class': 'wifimon-stat' }, [
							'\u0412\u0441\u0435\u0433\u043e \u2191 ', E('b', {}, formatBytes(client.tx_bytes))
						]),
						E('span', { 'class': 'wifimon-stat' }, [
							'\u041e\u043d\u043b\u0430\u0439\u043d: ', E('b', {}, formatTime(client.connected_time))
						]),
					]),
					dnsDiv
				]);

				card.addEventListener('click', function(ev) {
					ev.stopPropagation();

					if (openDnsMac === mac) {
						// Click same card — close it
						dnsDiv.classList.remove('open');
						openDnsMac = null;
						return;
					}

					// Close previous panel
					if (openDnsMac && dnsPanels[openDnsMac]) {
						dnsPanels[openDnsMac].classList.remove('open');
					}

					// Open this panel and always re-fetch DNS
					openDnsMac = mac;
					dnsDiv.classList.add('open');
					if (client.ip && client.ip !== 'N/A') {
						fetchDns(mac, client.ip, dnsDiv);
					}
				});

				listDiv.appendChild(card);
			});

			// Clean up panels for disconnected clients
			var activeMacs = {};
			data.forEach(function(c) { activeMacs[c.mac] = true; });
			Object.keys(dnsPanels).forEach(function(m) {
				if (!activeMacs[m]) delete dnsPanels[m];
			});
			if (openDnsMac && !activeMacs[openDnsMac]) openDnsMac = null;
		}

		renderClients(clients);

		// Poll every 5 seconds
		poll.add(function() {
			return callGetClients().then(function(data) {
				renderClients(data);
			});
		}, 5);

		return container;
	}
});
