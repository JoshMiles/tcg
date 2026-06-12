const _0x404baa = _0x627d;
(function(_0x5e5c27, _0x2c71ee) {
    const _0x3f585e = _0x627d,
        _0x4aee86 = _0x5e5c27();
    while (!![]) {
        try {
            const _0x1f89bf = -parseInt(_0x3f585e(0x1e8)) / 0x1 + parseInt(_0x3f585e(0x22b)) / 0x2 * (parseInt(_0x3f585e(0x1ff)) / 0x3) + -parseInt(_0x3f585e(0x25a)) / 0x4 + parseInt(_0x3f585e(0x272)) / 0x5 * (-parseInt(_0x3f585e(0x25d)) / 0x6) + parseInt(_0x3f585e(0x283)) / 0x7 + parseInt(_0x3f585e(0x1f2)) / 0x8 * (-parseInt(_0x3f585e(0x243)) / 0x9) + parseInt(_0x3f585e(0x1e0)) / 0xa;
            if (_0x1f89bf === _0x2c71ee) break;
            else _0x4aee86['push'](_0x4aee86['shift']());
        } catch (_0x1e052e) {
            _0x4aee86['push'](_0x4aee86['shift']());
        }
    }
}(_0x2f45, 0xed215));
let cardDrawing = ![],
    fieldData = {},
    cardQueue = [],
    revealedCardsByUser = {},
    cardCollectionKey = _0x404baa(0x204),
    firstDisplayName = null;
window['addEventListener'](_0x404baa(0x25c), function(_0x36e8ca) {

	console.log("rev cards by user: ", revealedCardsByUser);
    const _0x21d32d = _0x404baa;
    fieldData = _0x36e8ca['detail'][_0x21d32d(0x256)];
    fieldData['cardCollectionName'] && (cardCollectionKey = fieldData[_0x21d32d(0x2a2)] || _0x21d32d(0x204));
    const _0x3d54df = document[_0x21d32d(0x2a9)](_0x21d32d(0x1eb)),
        _0x5cd6d5 = _0x21d32d(0x203);
    _0x3d54df[_0x21d32d(0x1e4)] = _0x5cd6d5;
    const _0x179c74 = fieldData[_0x21d32d(0x23b)];
    document['getElementById'](_0x21d32d(0x26f))[_0x21d32d(0x1ea)] = _0x179c74, fieldData = _0x36e8ca[_0x21d32d(0x1f7)][_0x21d32d(0x256)], SE_API[_0x21d32d(0x29b)][_0x21d32d(0x23a)](cardCollectionKey)[_0x21d32d(0x285)](_0xabbd96 => {
        const _0x367a32 = _0x21d32d;
        _0xabbd96 && typeof _0xabbd96 === 'object' ? (revealedCardsByUser = _0xabbd96, console[_0x367a32(0x245)](_0x367a32(0x27b) + cardCollectionKey + _0x367a32(0x286), revealedCardsByUser)) : revealedCardsByUser = {};
    })[_0x21d32d(0x226)](_0x1f70a0 => {
        const _0xaa0d4b = _0x21d32d;
        console[_0xaa0d4b(0x29a)](_0xaa0d4b(0x265) + cardCollectionKey + ']:', _0x1f70a0), revealedCardsByUser = {};
    });
}), window[_0x404baa(0x21b)](_0x404baa(0x202), function(_0x5f583f) {

    const _0x5675ea = _0x404baa,
        _0x533245 = _0x5f583f[_0x5675ea(0x1f7)][_0x5675ea(0x280)],
        _0x245f5d = _0x5f583f[_0x5675ea(0x1f7)][_0x5675ea(0x255)][_0x5675ea(0x29f)],
        _0x287245 = _0x5f583f[_0x5675ea(0x1f7)][_0x5675ea(0x255)],
        _0x3b503c = _0x287245?.['data']?.[_0x5675ea(0x1de)] || null,
        _0x50164f = _0x287245?.[_0x5675ea(0x258)]?.[_0x5675ea(0x261)] || null;
    console[_0x5675ea(0x245)](_0x5675ea(0x21c), _0x5f583f[_0x5675ea(0x1f7)][_0x5675ea(0x255)]['type']), console[_0x5675ea(0x245)](_0x5675ea(0x27e), _0x5f583f[_0x5675ea(0x1f7)]['event']), console[_0x5675ea(0x245)](_0x5675ea(0x277), revealedCardsByUser);

    if (_0x5f583f['detail'][_0x5675ea(0x255)]['listener'] === 'widget-button') {
        if (_0x5f583f[_0x5675ea(0x1f7)]['event']['field'] === _0x5675ea(0x294)) cardQueue[_0x5675ea(0x2aa)](() => drawCard(_0x287245['displayName'])), !cardDrawing && processCardQueue();
        else {
            if (_0x5f583f[_0x5675ea(0x1f7)][_0x5675ea(0x255)][_0x5675ea(0x252)] === _0x5675ea(0x1e2)) {
                revealedCardsByUser = {}, SE_API[_0x5675ea(0x29b)]['set'](cardCollectionKey, {})[_0x5675ea(0x285)](() => {
                    const _0x5094a0 = _0x5675ea;
                    console['log'](_0x5094a0(0x230) + cardCollectionKey + ']'), showAlert(_0x5094a0(0x263) + cardCollectionKey + '\x20collection\x20reseted');
                })[_0x5675ea(0x226)](_0x550988 => {
                    const _0x11abb3 = _0x5675ea;
                    console[_0x11abb3(0x29a)]('❌\x20Failed\x20to\x20reset\x20saved\x20data\x20via\x20button:', _0x550988);
                });
                return;
            }
        }
    }
    if (_0x533245 === _0x5675ea(0x20b)) {
        const _0x5015b7 = parseInt(fieldData['followEffect']);
        if (_0x5015b7 === 0x1) {
            const _0x4db9bc = _0x287245[_0x5675ea(0x229)]?.[_0x5675ea(0x208)]() || _0x287245[_0x5675ea(0x258)]?.[_0x5675ea(0x213)]?.[_0x5675ea(0x208)]() || _0x287245[_0x5675ea(0x213)]?.[_0x5675ea(0x208)]() || 'someone';
            cardQueue[_0x5675ea(0x2aa)](() => drawCard(_0x4db9bc)), !cardDrawing && processCardQueue();
        }
    }
    if (_0x245f5d === 'communityGiftPurchase') {
        const _0x479569 = parseInt(fieldData['subEffect']);
        if (_0x479569 === 0x1) {
            const _0x4bbf02 = (_0x287245[_0x5675ea(0x258)]?.['amount'] || 0x1) - 0x1,
                _0x190177 = _0x287245[_0x5675ea(0x229)]?.['toLowerCase']() || _0x287245['data']?.[_0x5675ea(0x213)]?.[_0x5675ea(0x208)]() || _0x287245[_0x5675ea(0x213)]?.[_0x5675ea(0x208)]() || _0x5675ea(0x29c);
            for (let _0x1c2bb0 = 0x0; _0x1c2bb0 < _0x4bbf02; _0x1c2bb0++) {
                cardQueue['push'](() => drawCard(_0x190177));
            }!cardDrawing && processCardQueue();
        }
        return;
    }
    if (_0x533245 === _0x5675ea(0x240)) {
        const _0x2deb12 = parseInt(fieldData[_0x5675ea(0x259)]);
        if (_0x2deb12 === 0x1) {
            if (_0x287245[_0x5675ea(0x1e1)] && _0x287245[_0x5675ea(0x260)]) return;
            const _0x49985a = _0x287245['name']?.['toLowerCase']() || _0x287245['data']?.['displayName']?.['toLowerCase']() || _0x287245[_0x5675ea(0x213)]?.[_0x5675ea(0x208)]() || 'someone';
            cardQueue[_0x5675ea(0x2aa)](() => drawCard(_0x49985a)), !cardDrawing && processCardQueue();
        }
    }
    if (_0x533245 === _0x5675ea(0x1fb)) {
        const _0x5d72d4 = parseInt(fieldData[_0x5675ea(0x22d)]),
            _0x5db3f2 = parseFloat(fieldData['minTip']),
            _0x44ecd2 = parseFloat(_0x287245[_0x5675ea(0x269)]);
        if (!isNaN(_0x44ecd2) && _0x44ecd2 >= _0x5db3f2) {
            if (_0x5d72d4 === 0x1) {
                const _0x24e40a = _0x287245['name']?.[_0x5675ea(0x208)]() || _0x287245[_0x5675ea(0x258)]?.[_0x5675ea(0x213)]?.[_0x5675ea(0x208)]() || _0x287245[_0x5675ea(0x213)]?.[_0x5675ea(0x208)]() || _0x5675ea(0x29c);
                cardQueue[_0x5675ea(0x2aa)](() => drawCard(_0x24e40a)), !cardDrawing && processCardQueue();
            }
        }
    }
    if (_0x533245 === _0x5675ea(0x211)) {
        const _0x4a43dc = parseInt(fieldData[_0x5675ea(0x218)]),
            _0x3b8b12 = parseInt(fieldData[_0x5675ea(0x1dc)]),
            _0x225771 = parseInt(_0x287245['amount']);
        if (!isNaN(_0x225771) && _0x225771 >= _0x3b8b12) {
            if (_0x4a43dc === 0x1) {
                const _0x407cb4 = _0x287245[_0x5675ea(0x229)]?.[_0x5675ea(0x208)]() || _0x287245[_0x5675ea(0x258)]?.[_0x5675ea(0x213)]?.['toLowerCase']() || _0x287245[_0x5675ea(0x213)]?.['toLowerCase']() || _0x5675ea(0x29c);
                cardQueue[_0x5675ea(0x2aa)](() => drawCard(_0x407cb4)), !cardDrawing && processCardQueue();
            }
        }
    }
    if (_0x533245 === _0x5675ea(0x27d)) {
        const _0x1272ff = parseInt(fieldData[_0x5675ea(0x2a0)]),
            _0x5c5852 = parseFloat(fieldData[_0x5675ea(0x296)]),
            _0x3edb7e = parseFloat(_0x287245[_0x5675ea(0x269)]);
        if (!isNaN(_0x3edb7e) && _0x3edb7e >= _0x5c5852) {
            if (_0x1272ff === 0x1) {
                const _0x1c32b8 = _0x287245[_0x5675ea(0x229)]?.[_0x5675ea(0x208)]() || _0x287245['data']?.['displayName']?.[_0x5675ea(0x208)]() || _0x287245[_0x5675ea(0x213)]?.[_0x5675ea(0x208)]() || 'someone';
                cardQueue['push'](() => drawCard(_0x1c32b8)), !cardDrawing && processCardQueue();
            }
        }
    }
    if (_0x533245 === 'sponsor-latest') {
        const _0xb7aa30 = parseInt(fieldData['memberEffect']);
        if (_0xb7aa30 === 0x1) {
            const _0x4e8138 = _0x287245[_0x5675ea(0x229)]?.[_0x5675ea(0x208)]() || _0x287245[_0x5675ea(0x258)]?.[_0x5675ea(0x213)]?.['toLowerCase']() || _0x287245[_0x5675ea(0x213)]?.['toLowerCase']() || _0x5675ea(0x29c);
            cardQueue[_0x5675ea(0x2aa)](() => drawCard(_0x4e8138)), !cardDrawing && processCardQueue();
        }
    }
    if (_0x5f583f[_0x5675ea(0x1f7)][_0x5675ea(0x255)]['type'] === 'channelPointsRedemption') {
        const _0x17cccf = _0x5f583f[_0x5675ea(0x1f7)][_0x5675ea(0x255)][_0x5675ea(0x258)],
            _0x12374b = _0x5f583f[_0x5675ea(0x1f7)][_0x5675ea(0x255)][_0x5675ea(0x258)][_0x5675ea(0x254)][_0x5675ea(0x295)]()['toLowerCase'](),
            _0x243dfb = [fieldData['pointsReward1']?.[_0x5675ea(0x295)]()[_0x5675ea(0x208)](), fieldData[_0x5675ea(0x21a)]?.[_0x5675ea(0x295)]()[_0x5675ea(0x208)](), fieldData[_0x5675ea(0x273)]?.[_0x5675ea(0x295)]()[_0x5675ea(0x208)]()][_0x5675ea(0x268)](Boolean);
        console['log'](_0x5675ea(0x20f), _0x12374b), console[_0x5675ea(0x245)](_0x5675ea(0x28f), _0x243dfb), console[_0x5675ea(0x245)](_0x5675ea(0x201), _0x12374b), _0x243dfb[_0x5675ea(0x247)](_0x12374b) && (cardQueue[_0x5675ea(0x2aa)](() => drawCard(_0x17cccf[_0x5675ea(0x213)])), !cardDrawing && processCardQueue());
    }
    const _0x212c1e = _0x50164f['badges'] && _0x50164f['badges']['includes'](_0x5675ea(0x257)) || _0x287245['authorDetails']?.['isChatOwner'],
        _0x1abc1e = _0x50164f[_0x5675ea(0x233)] === '1' || _0x287245[_0x5675ea(0x210)]?.['isChatModerator'],
        _0x2d647b = _0x50164f[_0x5675ea(0x2a4)] && _0x50164f['badges'][_0x5675ea(0x247)]('vip/1'),
        _0x4afc9d = _0x50164f['subscriber'] === '1' || _0x287245[_0x5675ea(0x210)]?.['isChatSponsor'],
        _0x5a580c = _0x212c1e && fieldData['allowBroadcaster'] || _0x1abc1e && fieldData[_0x5675ea(0x2a8)] || _0x2d647b && fieldData[_0x5675ea(0x2a3)] || _0x4afc9d && fieldData['allowSubs'] || fieldData[_0x5675ea(0x1fe)] && !_0x212c1e && !_0x1abc1e && !_0x2d647b && !_0x4afc9d;
    if (_0x5a580c) {
        const _0x527de3 = _0x3b503c[_0x5675ea(0x295)](),
            _0x425b3d = fieldData['cardCommand']['trim'](),
            _0x23d97f = fieldData[_0x5675ea(0x1e5)][_0x5675ea(0x295)](),
            _0x2f9051 = fieldData[_0x5675ea(0x25b)]['trim'](),
            _0x44a175 = fieldData[_0x5675ea(0x27f)][_0x5675ea(0x295)](),
            _0x5f1ab1 = fieldData[_0x5675ea(0x21e)][_0x5675ea(0x295)]();
        if (_0x527de3 === _0x425b3d || _0x527de3[_0x5675ea(0x1e9)](_0x425b3d + '\x20')) cardQueue[_0x5675ea(0x2aa)](() => drawCard(_0x287245[_0x5675ea(0x258)]['displayName'])), !cardDrawing && processCardQueue();
        else {
            if (_0x527de3 === _0x23d97f || _0x527de3['startsWith'](_0x23d97f + '\x20')) cardQueue[_0x5675ea(0x2aa)](getShowCollectionFn(_0x287245[_0x5675ea(0x258)][_0x5675ea(0x213)])), !cardDrawing && processCardQueue();
            else {
                if (_0x527de3['startsWith'](_0x5675ea(0x20c))) {
                    if (!_0x212c1e && !_0x1abc1e) return;
                    const _0x18da46 = _0x527de3[_0x5675ea(0x2a7)]('\x20');
                    if (_0x18da46[_0x5675ea(0x266)] < 0x2) {
                        showAlert(_0x5675ea(0x223));
                        return;
                    }
                    const _0x19d82a = _0x18da46[0x1][_0x5675ea(0x208)]();
                    _0x19d82a === cardCollectionKey[_0x5675ea(0x208)]() ? (revealedCardsByUser = {}, SE_API[_0x5675ea(0x29b)][_0x5675ea(0x1fa)](cardCollectionKey, {})[_0x5675ea(0x285)](() => {
                        const _0x375402 = _0x5675ea;
                        console[_0x375402(0x245)](_0x375402(0x1ee) + cardCollectionKey + ']'), showAlert('🎴\x20' + cardCollectionKey + _0x375402(0x238));
                    })['catch'](_0x59e264 => {
                        const _0x57277f = _0x5675ea;
                        console[_0x57277f(0x29a)](_0x57277f(0x2a1) + cardCollectionKey + ']:', _0x59e264);
                    })) : showAlert(_0x5675ea(0x221) + _0x19d82a + _0x5675ea(0x1da));
                } else {
                    if (_0x527de3[_0x5675ea(0x1e9)](_0x2f9051)) {
                        if (!_0x212c1e && !_0x1abc1e) return;
                        const _0x5c326d = _0x527de3['split']('\x20');
                        if (_0x5c326d['length'] >= 0x2) {
                            const _0x59aa33 = _0x5c326d[0x1];
                            revealedCardsByUser[_0x5675ea(0x205)](_0x59aa33) ? (delete revealedCardsByUser[_0x59aa33], SE_API[_0x5675ea(0x29b)][_0x5675ea(0x1fa)](cardCollectionKey, revealedCardsByUser)[_0x5675ea(0x285)](() => {
                                const _0x5dbb3c = _0x5675ea;
                                console['log'](_0x5dbb3c(0x1f6) + _0x59aa33), showAlert(_0x5dbb3c(0x24e) + _0x59aa33);
                            })['catch'](_0x28d35c => {
                                const _0x969256 = _0x5675ea;
                                console[_0x969256(0x29a)](_0x969256(0x209) + _0x59aa33 + ':', _0x28d35c);
                            })) : console[_0x5675ea(0x245)](_0x5675ea(0x224) + _0x59aa33 + '\x20not\x20found\x20in\x20revealedCardsByUser.');
                        }
                    } else {
                        if (_0x527de3[_0x5675ea(0x1e9)](_0x44a175)) {
                            if (!_0x212c1e && !_0x1abc1e) return;
                            const _0x5838f6 = _0x527de3[_0x5675ea(0x2a7)]('\x20');
                            if (_0x5838f6['length'] < 0x3) {
                                showAlert(_0x5675ea(0x2a6));
                                return;
                            }
                            const _0x446c76 = _0x5838f6[0x1][_0x5675ea(0x208)](),
                                _0x1c59ff = parseInt(_0x5838f6[0x2]);
                            if (isNaN(_0x1c59ff)) {
                                showAlert(_0x5675ea(0x20e));
                                return;
                            }!revealedCardsByUser[_0x446c76] && (revealedCardsByUser[_0x446c76] = []), !revealedCardsByUser[_0x446c76][_0x5675ea(0x247)](_0x1c59ff) ? (revealedCardsByUser[_0x446c76][_0x5675ea(0x2aa)](_0x1c59ff), SE_API[_0x5675ea(0x29b)][_0x5675ea(0x1fa)](cardCollectionKey, revealedCardsByUser)[_0x5675ea(0x285)](() => {
                                const _0x186bb9 = _0x5675ea;
                                console[_0x186bb9(0x245)](_0x186bb9(0x206) + _0x1c59ff + _0x186bb9(0x1e7) + _0x446c76), showAlert(_0x186bb9(0x264) + _0x1c59ff + _0x186bb9(0x1e7) + _0x446c76);
                            })['catch'](_0x541f41 => {
                                const _0x198b16 = _0x5675ea;
                                console[_0x198b16(0x29a)](_0x198b16(0x1ed), _0x541f41), showAlert(_0x198b16(0x26b));
                            })) : showAlert(_0x5675ea(0x1f3) + _0x446c76 + _0x5675ea(0x219) + _0x1c59ff);
                        } else {
                            if (_0x527de3['startsWith'](_0x5f1ab1)) {
                                if (!_0x212c1e && !_0x1abc1e) return;
                                const _0x3f4247 = _0x527de3[_0x5675ea(0x2a7)]('\x20');
                                if (_0x3f4247[_0x5675ea(0x266)] < 0x2) {
                                    showAlert(_0x5675ea(0x214));
                                    return;
                                }
                                const _0x50ca3c = _0x3f4247[0x1][_0x5675ea(0x208)]();
                                cardQueue[_0x5675ea(0x2aa)](() => drawCard(_0x50ca3c)), !cardDrawing && processCardQueue(), console[_0x5675ea(0x245)](_0x5675ea(0x284) + _0x50ca3c);
                            }
                        }
                    }
                }
            }
        }
    }
});

function showAlert(_0x1681a6) {
    const _0x43c2f4 = _0x404baa,
        _0x53961a = document[_0x43c2f4(0x217)](_0x43c2f4(0x207));
    if (!_0x53961a) return;
    _0x53961a[_0x43c2f4(0x29e)] = _0x1681a6, _0x53961a['style'][_0x43c2f4(0x278)] = _0x43c2f4(0x242), setTimeout(() => {
        const _0x51bbb4 = _0x43c2f4;
        _0x53961a[_0x51bbb4(0x234)][_0x51bbb4(0x278)] = _0x51bbb4(0x227);
    }, 0xbb8);
}

function saveRevealedCards() {
    const _0x5055ef = _0x404baa;
    window[_0x5055ef(0x232)] && window[_0x5055ef(0x232)][_0x5055ef(0x29b)] && SE_API[_0x5055ef(0x29b)][_0x5055ef(0x1fa)](cardCollectionKey, revealedCardsByUser)[_0x5055ef(0x285)](() => console['log']('💾\x20Saved\x20revealed\x20cards\x20[' + cardCollectionKey + ']:', revealedCardsByUser))[_0x5055ef(0x226)](_0x3470f8 => console[_0x5055ef(0x29a)](_0x5055ef(0x215) + cardCollectionKey + ']:', _0x3470f8));
}

function processCardQueue() {
    const _0xe6ae08 = _0x404baa;
    if (cardQueue[_0xe6ae08(0x266)] === 0x0) {
        cardDrawing = ![];
        return;
    }
    cardDrawing = !![];
    const _0x1a77d8 = cardQueue[_0xe6ae08(0x222)]();
    _0x1a77d8();
    const _0x9dd792 = fieldData[_0xe6ae08(0x23d)] || 0x1,
        _0x40e3ee = fieldData['cooldownTime'] || 0x1;
    setTimeout(() => processCardQueue(), _0x40e3ee * 0x3e8 + _0x9dd792 * 0x3e8 + 0xfa0);
}

function _0x627d(_0x45e43b, _0x49054c) {
    _0x45e43b = _0x45e43b - 0x1d8;
    const _0x2f456b = _0x2f45();
    let _0x627d2 = _0x2f456b[_0x45e43b];
    return _0x627d2;
}
let collectionTimeout;

function getShowCollectionFn(_0x41ab8f) {
    return () => {
        const _0x432187 = _0x627d,
            _0x103e83 = _0x41ab8f?.[_0x432187(0x208)]() || _0x432187(0x29c),
            _0x21d160 = document['querySelector'](_0x432187(0x274)),
            _0x2ab51c = _0x21d160[_0x432187(0x2a9)](_0x432187(0x231)),
            _0x47542a = _0x21d160[_0x432187(0x2a9)]('.card-info'),
            _0x552be9 = document[_0x432187(0x2a9)](_0x432187(0x23e)),
            _0x211288 = _0x21d160[_0x432187(0x2a9)](_0x432187(0x1d9)),
            _0x18be52 = document[_0x432187(0x2a9)](_0x432187(0x24f));
        _0x211288[_0x432187(0x234)][_0x432187(0x27a)] = _0x432187(0x1d8), _0x18be52[_0x432187(0x234)]['visibility'] = _0x432187(0x1d8), setTimeout(() => {
            const _0x14f96a = _0x432187;
            _0x211288[_0x14f96a(0x234)][_0x14f96a(0x27a)] = 'visible', _0x18be52[_0x14f96a(0x234)][_0x14f96a(0x27a)] = _0x14f96a(0x1fc);
        }, 0x1388);
        const _0x3be67d = Math[_0x432187(0x291)](parseInt(fieldData[_0x432187(0x275)]) || 0x7, 0x32),
            _0x2c750d = [];
        for (let _0x58f14c = 0x1; _0x58f14c <= _0x3be67d; _0x58f14c++) {
            _0x2c750d[_0x432187(0x2aa)]({
                'number': _0x58f14c,
                'image': fieldData[_0x432187(0x237) + _0x58f14c + _0x432187(0x287)]
            });
        }
        const _0x3d912c = revealedCardsByUser[_0x103e83] || [];
        console.log("maybe total card value maybe ", _0x3be67d);
        const sorted_user_cards = _0x3d912c.toSorted();
        sorted_user_cards.sort(function(a, b){return a - b});
        console.log("sorted i hope: ", sorted_user_cards);
        console.log("username mayubes ", _0x103e83);
        const sortedusercardsstr = "#" + sorted_user_cards.toString().replaceAll(",", ", #");

	const customJSONObject2 = {
			totalCards: _0x3be67d,          
			userscardsamt: sorted_user_cards.length,
            userscards: sortedusercardsstr,
            username: _0x103e83
			};
			console.log("collection object:", JSON.stringify(customJSONObject2));
			fetch('https://desktop.api.mixitupapp.com/api/webhook/78478e90-a7b8-4744-b0d4-5ee7fef3e337?secret=FAB887237CC3FF00728CE9C4BDA9E4CA4A46135DE2D334A083F80948EB164827', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(customJSONObject2)
        })
        .then(() => console.log("The collection card message sent successfully!"))
        .catch(e => console.error("The collection card data failed to send:", e));

        _0x2ab51c['innerHTML'] = '';
        for (let _0x2bcdcf = 0x0; _0x2bcdcf < _0x3be67d; _0x2bcdcf++) {
            const _0x4a4cb6 = document[_0x432187(0x212)](_0x432187(0x271));
            _0x4a4cb6['classList'][_0x432187(0x21d)](_0x432187(0x235)), _0x4a4cb6[_0x432187(0x234)][_0x432187(0x28a)] = _0x432187(0x29d);
            const _0x1a8915 = _0x2c750d[_0x2bcdcf];
            if (_0x3d912c[_0x432187(0x247)](_0x1a8915[_0x432187(0x267)]) && _0x1a8915['image']) _0x4a4cb6[_0x432187(0x234)][_0x432187(0x2a5)] = _0x432187(0x1f4) + _0x1a8915['image'] + '\x27)', _0x4a4cb6[_0x432187(0x234)][_0x432187(0x299)] = 'cover', _0x4a4cb6['style'][_0x432187(0x28c)] = _0x432187(0x244), _0x4a4cb6[_0x432187(0x234)][_0x432187(0x276)] = _0x432187(0x251), _0x4a4cb6[_0x432187(0x234)][_0x432187(0x28b)] = _0x432187(0x292), _0x4a4cb6[_0x432187(0x234)]['border'] = _0x432187(0x1ec);
            else {
                _0x4a4cb6[_0x432187(0x234)][_0x432187(0x2a5)] = _0x432187(0x227);
                const _0x35f2d4 = document[_0x432187(0x212)]('span');
                _0x35f2d4[_0x432187(0x290)][_0x432187(0x21d)](_0x432187(0x248)), _0x35f2d4[_0x432187(0x281)] = '?', _0x35f2d4['style']['position'] = _0x432187(0x236), _0x35f2d4[_0x432187(0x234)][_0x432187(0x200)] = _0x432187(0x26e), _0x35f2d4['style']['left'] = '50%', _0x35f2d4[_0x432187(0x234)][_0x432187(0x23c)] = _0x432187(0x2ab), _0x35f2d4['style'][_0x432187(0x1dd)] = 'Poppins,\x20sans-serif', _0x35f2d4[_0x432187(0x234)][_0x432187(0x279)] = _0x432187(0x250), _0x35f2d4[_0x432187(0x234)][_0x432187(0x1f9)] = _0x432187(0x20a), _0x35f2d4[_0x432187(0x234)]['color'] = _0x432187(0x249), _0x35f2d4[_0x432187(0x234)][_0x432187(0x1f8)] = _0x432187(0x227), _0x4a4cb6[_0x432187(0x26a)](_0x35f2d4);
            }
            _0x2ab51c[_0x432187(0x26a)](_0x4a4cb6);
        }
        if (_0x552be9) {
            const _0x51b1fe = _0x41ab8f || 'Someone';
            _0x552be9[_0x432187(0x281)] = _0x51b1fe + '\x27s\x20collection:';
        }
        _0x21d160['style'][_0x432187(0x27a)] = 'visible', _0x21d160[_0x432187(0x290)]['remove']('hid'), _0x21d160[_0x432187(0x290)][_0x432187(0x1fd)](_0x432187(0x1d8)), _0x47542a['style']['opacity'] = '1', _0x47542a[_0x432187(0x234)][_0x432187(0x23c)] = _0x432187(0x297), collectionTimeout && clearTimeout(collectionTimeout), collectionTimeout = setTimeout(() => {
            const _0x4e482b = _0x432187;
            _0x21d160[_0x4e482b(0x290)][_0x4e482b(0x21d)](_0x4e482b(0x1f0)), setTimeout(() => {
                const _0x5e9896 = _0x4e482b;
                _0x21d160['style']['visibility'] = _0x5e9896(0x1d8);
            }, 0x1f4);
        }, 0xfa0);
    };
}

function drawCard(_0x4a439e) {

    const _0x220fd8 = _0x404baa,
        _0xfd05b5 = _0x4a439e?.[_0x220fd8(0x208)]() || _0x220fd8(0x29c);
    !revealedCardsByUser[_0xfd05b5] && (revealedCardsByUser[_0xfd05b5] = []);
    const _0x1d2bc4 = parseInt(fieldData[_0x220fd8(0x1db)]) / 0x64,
        _0x4b5c5e = new Audio(_0x220fd8(0x24a));

    _0x4b5c5e[_0x220fd8(0x25f)] = _0x1d2bc4, _0x4b5c5e[_0x220fd8(0x289)](), setTimeout(() => {
        const _0x3bec2c = _0x220fd8,
            _0x6b810c = new Audio('https://cdn.freesound.org/previews/787/787409_12262933-lq.mp3');
        _0x6b810c['volume'] = _0x1d2bc4, _0x6b810c[_0x3bec2c(0x289)]();
    }, 0x1c2), setTimeout(() => {
        const _0x57d3bb = _0x220fd8,
            _0x9e256b = new Audio('https://cdn.freesound.org/previews/787/787405_12262933-lq.mp3');
        _0x9e256b[_0x57d3bb(0x25f)] = _0x1d2bc4, _0x9e256b[_0x57d3bb(0x289)]();
    }, 0x582), setTimeout(() => {
        const _0x13edfd = _0x220fd8,
            _0x479328 = new Audio('https://cdn.freesound.org/previews/810/810183_17437502-lq.mp3');
        _0x479328[_0x13edfd(0x25f)] = _0x1d2bc4, _0x479328[_0x13edfd(0x289)]();
    }, 0xaf0);
    const _0x49cb5d = document[_0x220fd8(0x2a9)](_0x220fd8(0x274)),
        _0x570cff = _0x49cb5d[_0x220fd8(0x2a9)](_0x220fd8(0x1f5)),
        _0x17a4d1 = _0x49cb5d[_0x220fd8(0x2a9)]('.card-mini-list'),
        _0x708af7 = _0x49cb5d[_0x220fd8(0x2a9)](_0x220fd8(0x22c)),
        _0x3b2d6a = _0x49cb5d[_0x220fd8(0x2a9)](_0x220fd8(0x1d9)),
        _0x2e5929 = _0x49cb5d[_0x220fd8(0x2a9)]('.card-label'),
        _0x1adf19 = _0x49cb5d[_0x220fd8(0x2a9)](_0x220fd8(0x28d)),
        _0x425905 = _0x49cb5d['querySelector'](_0x220fd8(0x225)),
        _0x11de77 = fieldData[_0x220fd8(0x23d)] || 0x1,
        _0x5a1c75 = _0x49cb5d['querySelector']('.radial-container');
    _0x708af7[_0x220fd8(0x234)][_0x220fd8(0x282)] = '0', _0x3b2d6a['style']['opacity'] = '0', _0x2e5929[_0x220fd8(0x234)][_0x220fd8(0x282)] = '0', _0x1adf19[_0x220fd8(0x234)][_0x220fd8(0x282)] = '0', _0x5a1c75[_0x220fd8(0x234)][_0x220fd8(0x282)] = '0', _0x1adf19[_0x220fd8(0x234)]['transform'] = _0x220fd8(0x228), _0x49cb5d[_0x220fd8(0x234)][_0x220fd8(0x27a)] = 'visible', _0x49cb5d[_0x220fd8(0x290)][_0x220fd8(0x1fd)](_0x220fd8(0x1d8)), _0x49cb5d['classList'][_0x220fd8(0x1fd)](_0x220fd8(0x1f0)), _0x708af7[_0x220fd8(0x234)]['animation'] = _0x220fd8(0x227), void _0x708af7[_0x220fd8(0x1f1)], _0x708af7['style'][_0x220fd8(0x253)] = 'fadeScaleIn\x204.5s\x20ease', _0x425905['style'][_0x220fd8(0x253)] = _0x220fd8(0x227), void _0x425905[_0x220fd8(0x1f1)], _0x425905[_0x220fd8(0x234)][_0x220fd8(0x253)] = _0x220fd8(0x26c), _0x3b2d6a[_0x220fd8(0x234)][_0x220fd8(0x253)] = _0x220fd8(0x227), void _0x3b2d6a[_0x220fd8(0x1f1)], _0x3b2d6a[_0x220fd8(0x234)][_0x220fd8(0x253)] = 'cardBoxIn\x207.5s\x20ease\x20forwards', setTimeout(() => {
        const _0x17a4df = _0x220fd8;
        _0x5a1c75[_0x17a4df(0x234)]['opacity'] = '1', _0x5a1c75[_0x17a4df(0x234)][_0x17a4df(0x253)] = 'spinRadial\x204s\x20linear\x20infinite';
    }, 0xaf0), setTimeout(() => {
        const _0x176cdd = _0x220fd8;
        _0x2e5929[_0x176cdd(0x234)]['opacity'] = '1', label[_0x176cdd(0x234)][_0x176cdd(0x27a)] = 'visible';
    }, 0xc80), setTimeout(() => {
        const _0xbbbc12 = _0x220fd8;
        _0x1adf19[_0xbbbc12(0x234)]['opacity'] = '1', _0x1adf19[_0xbbbc12(0x234)][_0xbbbc12(0x23c)] = _0xbbbc12(0x297);
        const _0x4af799 = document[_0xbbbc12(0x2a9)](_0xbbbc12(0x23e));
        if (_0x4af799) {
            const _0x264f77 = _0x4a439e || 'Someone';
            _0x4af799[_0xbbbc12(0x281)] = _0x264f77 + _0xbbbc12(0x23f);
        }
    }, 0xbb8);
    const _0x1e5bb0 = Math[_0x220fd8(0x291)](parseInt(fieldData[_0x220fd8(0x275)]) || 0x7, 0x32),
        _0x55dfb6 = [];
    for (let _0x145484 = 0x1; _0x145484 <= _0x1e5bb0; _0x145484++) {
        _0x55dfb6[_0x220fd8(0x2aa)]({
            'number': _0x145484,
            'image': fieldData[_0x220fd8(0x237) + _0x145484 + _0x220fd8(0x287)],
            'name': fieldData[_0x220fd8(0x237) + _0x145484 + _0x220fd8(0x27c)] || _0x220fd8(0x241) + _0x145484,
            'probability': parseInt(fieldData[_0x220fd8(0x237) + _0x145484 + _0x220fd8(0x288)]) || 0x0,
            'stars': parseInt(fieldData['card' + _0x145484 + _0x220fd8(0x21f)]) || 0x1
        });
    }
    const _0x2a5aa3 = _0x55dfb6[_0x220fd8(0x1ef)]((_0x3ffb8a, _0x13f050) => _0x3ffb8a + _0x13f050[_0x220fd8(0x20d)], 0x0),
        _0x208466 = Math[_0x220fd8(0x216)]() * _0x2a5aa3;
    let _0x515814 = 0x0,
        _0x1f149d = _0x55dfb6[0x0];
    for (const _0x2972e1 of _0x55dfb6) {
        _0x515814 += _0x2972e1[_0x220fd8(0x20d)];
        if (_0x208466 <= _0x515814) {
            _0x1f149d = _0x2972e1;
			
            break;
        }
    }!Array['isArray'](revealedCardsByUser[_0xfd05b5]) && (revealedCardsByUser[_0xfd05b5] = []);

	const customJSONObject = {
			..._0x1f149d,          
			username: _0x4a439e  
			};
			console.log("card select object:", JSON.stringify(customJSONObject));
			fetch('https://desktop.api.mixitupapp.com/api/webhook/200feeac-6d7c-4b18-2ddd-08de5a22ea46?secret=B78BE1F604FFC20675E14C97F299CEE416FE94ACC5419B487F9255667007FCE8', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(customJSONObject)
        })
        .then(() => console.log("The card message sent successfully!"))
        .catch(e => console.error("The card data failed to send:", e));
    !revealedCardsByUser[_0xfd05b5][_0x220fd8(0x247)](_0x1f149d[_0x220fd8(0x267)]) && (revealedCardsByUser[_0xfd05b5][_0x220fd8(0x2aa)](_0x1f149d[_0x220fd8(0x267)]), saveRevealedCards(), SE_API[_0x220fd8(0x29b)]['set'](cardCollectionKey, revealedCardsByUser)['then'](() => {
        const _0x137cd3 = _0x220fd8;
        console[_0x137cd3(0x245)](_0x137cd3(0x22a), revealedCardsByUser);
        const _0x4dbfe9 = document[_0x137cd3(0x2a9)](_0x137cd3(0x26d)),
            _0x2668ad = fieldData[_0x137cd3(0x23d)] || 0x1;
        _0x4dbfe9[_0x137cd3(0x234)][_0x137cd3(0x27a)] = 'visible', setTimeout(() => {
            const _0x3fecf1 = _0x137cd3;
            _0x4dbfe9[_0x3fecf1(0x234)]['visibility'] = 'hidden';
        }, _0x2668ad * 0x3e8 + 0xfa0);
    })[_0x220fd8(0x226)](_0x141eac => {
        const _0x18ec17 = _0x220fd8;
        console[_0x18ec17(0x29a)]('❌\x20Failed\x20to\x20save\x20revealed\x20cards:', _0x141eac);
    }));
    const _0x117a1e = _0x49cb5d[_0x220fd8(0x2a9)](_0x220fd8(0x24c)),
        _0x12f9bb = parseInt(fieldData['holoStarsCards']) || 0x5;
    if (_0x1f149d[_0x220fd8(0x22e)] >= _0x12f9bb && _0x117a1e) _0x117a1e[_0x220fd8(0x290)][_0x220fd8(0x1fd)](_0x220fd8(0x246)), void _0x117a1e['offsetWidth'], _0x117a1e[_0x220fd8(0x290)][_0x220fd8(0x21d)](_0x220fd8(0x246));
    else _0x117a1e && (_0x117a1e[_0x220fd8(0x290)][_0x220fd8(0x1fd)](_0x220fd8(0x246)), _0x117a1e[_0x220fd8(0x234)][_0x220fd8(0x282)] = 0x0);
    _0x1f149d[_0x220fd8(0x270)] ? (_0x570cff[_0x220fd8(0x234)][_0x220fd8(0x2a5)] = _0x220fd8(0x1f4) + _0x1f149d[_0x220fd8(0x270)] + '\x27)', _0x570cff['style'][_0x220fd8(0x299)] = _0x220fd8(0x262), _0x570cff[_0x220fd8(0x234)][_0x220fd8(0x28c)] = _0x220fd8(0x244), _0x570cff[_0x220fd8(0x234)][_0x220fd8(0x276)] = 'no-repeat', _0x570cff[_0x220fd8(0x234)][_0x220fd8(0x28b)] = 'transparent') : (_0x570cff[_0x220fd8(0x234)]['backgroundImage'] = 'none', _0x570cff[_0x220fd8(0x234)][_0x220fd8(0x28b)] = _0x220fd8(0x249));
    const _0x50d189 = _0x570cff[_0x220fd8(0x2a9)](_0x220fd8(0x24d)),
        _0x22fe6f = _0x220fd8(0x1df);
    _0x50d189 && (_0x50d189['querySelector']('.card-name')[_0x220fd8(0x281)] = _0x1f149d[_0x220fd8(0x229)], _0x50d189[_0x220fd8(0x2a9)]('.card-stars')[_0x220fd8(0x1e4)] = _0x22fe6f[_0x220fd8(0x24b)](_0x1f149d[_0x220fd8(0x22e)]));
    for (let _0x39315d = 0x1; _0x39315d <= 0x32; _0x39315d++) {
        const _0x204a4f = _0x570cff[_0x220fd8(0x2a9)](_0x220fd8(0x1e6) + _0x39315d + _0x220fd8(0x1e3));
        if (_0x204a4f) _0x204a4f[_0x220fd8(0x281)] = '';
    }
    const _0x5ceac2 = _0x570cff[_0x220fd8(0x2a9)](_0x220fd8(0x239)),
        _0x2dd387 = _0x570cff[_0x220fd8(0x2a9)](_0x220fd8(0x22f));
    if (_0x5ceac2) _0x5ceac2['textContent'] = _0x1f149d[_0x220fd8(0x267)];
    if (_0x2dd387) _0x2dd387[_0x220fd8(0x281)] = _0x1f149d['number'];
    const _0x49e9e3 = revealedCardsByUser[_0xfd05b5];
    _0x17a4d1[_0x220fd8(0x1e4)] = '';
    for (let _0x56825a = 0x0; _0x56825a < _0x1e5bb0; _0x56825a++) {
        const _0x47726c = document[_0x220fd8(0x212)]('div');
        _0x47726c[_0x220fd8(0x290)][_0x220fd8(0x21d)](_0x220fd8(0x235)), _0x47726c[_0x220fd8(0x234)]['position'] = _0x220fd8(0x29d);
        const _0x2847c = _0x55dfb6[_0x56825a];
        if (_0x49e9e3[_0x220fd8(0x247)](_0x2847c[_0x220fd8(0x267)]) && _0x2847c[_0x220fd8(0x270)]) _0x47726c[_0x220fd8(0x234)][_0x220fd8(0x2a5)] = _0x220fd8(0x1f4) + _0x2847c[_0x220fd8(0x270)] + '\x27)', _0x47726c[_0x220fd8(0x234)]['backgroundSize'] = _0x220fd8(0x262), _0x47726c[_0x220fd8(0x234)][_0x220fd8(0x28c)] = _0x220fd8(0x244), _0x47726c[_0x220fd8(0x234)][_0x220fd8(0x276)] = 'no-repeat', _0x47726c[_0x220fd8(0x234)][_0x220fd8(0x28b)] = _0x220fd8(0x292), _0x47726c['style'][_0x220fd8(0x298)] = _0x220fd8(0x1ec);
        else {
            _0x47726c[_0x220fd8(0x234)][_0x220fd8(0x2a5)] = _0x220fd8(0x227);
            const _0x326803 = document[_0x220fd8(0x212)](_0x220fd8(0x25e));
            _0x326803[_0x220fd8(0x290)][_0x220fd8(0x21d)](_0x220fd8(0x248)), _0x326803['textContent'] = '?', _0x326803[_0x220fd8(0x234)]['position'] = 'absolute', _0x326803[_0x220fd8(0x234)][_0x220fd8(0x200)] = _0x220fd8(0x26e), _0x326803[_0x220fd8(0x234)][_0x220fd8(0x293)] = '50%', _0x326803[_0x220fd8(0x234)][_0x220fd8(0x23c)] = 'translate(-50%,\x20-50%)', _0x326803[_0x220fd8(0x234)][_0x220fd8(0x1dd)] = 'Poppins,\x20sans-serif', _0x326803['style'][_0x220fd8(0x279)] = _0x220fd8(0x250), _0x326803[_0x220fd8(0x234)][_0x220fd8(0x1f9)] = _0x220fd8(0x20a), _0x326803[_0x220fd8(0x234)]['color'] = _0x220fd8(0x249), _0x326803[_0x220fd8(0x234)]['pointerEvents'] = 'none', _0x47726c[_0x220fd8(0x26a)](_0x326803);
        }
        _0x17a4d1[_0x220fd8(0x26a)](_0x47726c);
    }
    const _0x4e6666 = _0x1f149d[_0x220fd8(0x267)] - 0x1,
        _0x1d5fa8 = _0x17a4d1['querySelectorAll'](_0x220fd8(0x28e));
    _0x1d5fa8[_0x4e6666] && _0x1f149d[_0x220fd8(0x270)] && (_0x1d5fa8[_0x4e6666][_0x220fd8(0x234)][_0x220fd8(0x2a5)] = _0x220fd8(0x1f4) + _0x1f149d[_0x220fd8(0x270)] + '\x27)', _0x1d5fa8[_0x4e6666]['style'][_0x220fd8(0x299)] = _0x220fd8(0x262), _0x1d5fa8[_0x4e6666][_0x220fd8(0x234)]['backgroundPosition'] = 'center', _0x1d5fa8[_0x4e6666]['style']['backgroundRepeat'] = _0x220fd8(0x251), _0x1d5fa8[_0x4e6666][_0x220fd8(0x234)][_0x220fd8(0x28b)] = _0x220fd8(0x292), _0x1d5fa8[_0x4e6666][_0x220fd8(0x234)][_0x220fd8(0x298)] = _0x220fd8(0x1ec));
    const _0x1e5e77 = _0x1d5fa8[_0x4e6666]['querySelector'](_0x220fd8(0x220));
    if (_0x1e5e77) _0x1e5e77[_0x220fd8(0x1fd)]();
    setTimeout(() => {
        const _0x219499 = _0x220fd8;
        _0x49cb5d[_0x219499(0x290)][_0x219499(0x21d)](_0x219499(0x1f0)), setTimeout(() => {
            const _0x3bfd2e = _0x219499;
            _0x49cb5d['style']['visibility'] = _0x3bfd2e(0x1d8);
        }, 0x1f4);
    }, _0x11de77 * 0x3e8 + 0xfa0);
}

function _0x2f45() {
    const _0x3ea40a = ['set', 'tip-latest', 'visible', 'remove', 'allowViewers', '2198583pCLNTJ', 'top', 'Twitch\x20Channel\x20Point\x20Redemption:', 'onEventReceived', '\x0a\x20\x20<div\x20id=\x22alert\x22></div>\x0a\x20\x20<div\x20class=\x22card-wrapper\x20hidden\x22>\x0a\x20\x20<div\x20class=\x22package-container\x22>\x0a\x20\x20\x20\x20<div\x20class=\x22tear-border-1\x22>\x0a\x20\x20\x20\x20\x20\x20<svg\x20version=\x221.1\x22\x20xmlns=\x22http://www.w3.org/2000/svg\x22\x20width=\x22609\x22\x20height=\x2286\x22>\x0a\x20\x20\x20\x20\x20\x20\x20\x20<path\x20d=\x22M0\x200\x20C3.37186052\x202.36474552\x206.12100769\x205.10879735\x208.98046875\x208.05859375\x20C9.53025391\x208.61740234\x2010.08003906\x209.17621094\x2010.64648438\x209.75195312\x20C11.99160571\x2011.12046787\x2013.33043518\x2012.49516208\x2014.66796875\x2013.87109375\x20C19.02007403\x2010.22953627\x2023.09686227\x206.51446195\x2026.9921875\x202.38671875\x20C30.57277703\x20-0.85166992\x2033.81556917\x20-1.59934012\x2038.6640625\x20-1.4296875\x20C45.69119301\x20-0.37493302\x2050.98840414\x207.00434656\x2055.66796875\x2011.87109375\x20C59.53856147\x2010.29950738\x2061.87215484\x207.8048655\x2064.73046875\x204.80859375\x20C68.54636412\x200.80907635\x2070.40877083\x20-0.96155826\x2076.04296875\x20-1.37890625\x20C82.78301973\x20-0.91407515\x2086.50980338\x203.4466923\x2090.98046875\x208.05859375\x20C91.53025391\x208.61740234\x2092.08003906\x209.17621094\x2092.64648438\x209.75195312\x20C93.99160571\x2011.12046787\x2095.33043518\x2012.49516208\x2096.66796875\x2013.87109375\x20C101.02007403\x2010.22953627\x20105.09686227\x206.51446195\x20108.9921875\x202.38671875\x20C112.57377368\x20-0.85257131\x20115.67406575\x20-1.37614134\x20120.47265625\x20-1.58984375\x20C126.30437742\x20-0.36538984\x20130.54562434\x204.4825388\x20134.54296875\x208.62109375\x20C135.04054687\x209.12769531\x20135.538125\x209.63429688\x20136.05078125\x2010.15625\x20C137.26120077\x2011.38994682\x20138.46526728\x2012.62987159\x20139.66796875\x2013.87109375\x20C144.35814617\x209.96261256\x20148.71862928\x205.89153229\x20152.96875\x201.5078125\x20C156.29434308\x20-1.69545992\x20159.55421918\x20-1.64391704\x20164.0078125\x20-1.60546875\x20C168.78742565\x20-0.74920913\x20171.4011256\x202.49647845\x20174.66796875\x205.87109375\x20C175.98900183\x207.0310866\x20177.32161482\x208.17808815\x20178.66796875\x209.30859375\x20C179.65796875\x2010.15421875\x20180.64796875\x2010.99984375\x20181.66796875\x2011.87109375\x20C182.78945313\x2010.71480469\x20182.78945313\x2010.71480469\x20183.93359375\x209.53515625\x20C184.92811526\x208.52187019\x20185.92292198\x207.508864\x20186.91796875\x206.49609375\x20C187.40910156\x205.98820313\x20187.90023437\x205.4803125\x20188.40625\x204.95703125\x20C192.42179619\x200.88794445\x20195.26804138\x20-1.40259173\x20201.04296875\x20-1.50390625\x20C210.26254304\x20-1.2040827\x20215.66049633\x206.64991678\x20221.66796875\x2012.87109375\x20C225.70932462\x2011.27178941\x20228.34704027\x208.38448966\x20231.29296875\x205.30859375\x20C237.65535845\x20-1.27982821\x20237.65535845\x20-1.27982821\x20243.29296875\x20-1.62890625\x20C248.65329786\x20-1.57491732\x20251.0575568\x200.13934353\x20254.7734375\x203.84765625\x20C255.39863281\x204.51539063\x20256.02382813\x205.183125\x20256.66796875\x205.87109375\x20C257.99977534\x207.18514292\x20259.3330273\x208.4977294\x20260.66796875\x209.80859375\x20C261.67057588\x2010.82686662\x20262.67160688\x2011.8467092\x20263.66796875\x2012.87109375\x20C268.56588678\x2010.88025409\x20271.57960859\x206.96196205\x20275.1328125\x203.18359375\x20C278.67057532\x20-0.04345646\x20281.39149982\x20-0.98965509\x20286.10546875\x20-1.50390625\x20C294.26158251\x20-0.64536796\x20299.26035065\x206.24717093\x20304.66796875\x2011.87109375\x20C308.53856147\x2010.29950738\x20310.87215484\x207.8048655\x20313.73046875\x204.80859375\x20C317.54636412\x200.80907635\x20319.40877083\x20-0.96155826\x20325.04296875\x20-1.37890625\x20C331.78301973\x20-0.91407515\x20335.50980338\x203.4466923\x20339.98046875\x208.05859375\x20C340.53025391\x208.61740234\x20341.08003906\x209.17621094\x20341.64648438\x209.75195312\x20C342.99160571\x2011.12046787\x20344.33043518\x2012.49516208\x20345.66796875\x2013.87109375\x20C350.02007403\x2010.22953627\x20354.09686227\x206.51446195\x20357.9921875\x202.38671875\x20C360.91151105\x20-0.25360185\x20363.12008198\x20-1.07817599\x20367.04296875\x20-1.44140625\x20C374.216835\x20-0.8229695\x20378.30365653\x203.09109242\x20383.04296875\x208.05859375\x20C383.86087891\x208.89680664\x20383.86087891\x208.89680664\x20384.6953125\x209.75195312\x20C386.02653644\x2011.11820927\x20387.34825185\x2012.49371932\x20388.66796875\x2013.87109375\x20C393.35814617\x209.96261256\x20397.71862928\x205.89153229\x20401.96875\x201.5078125\x20C405.29434308\x20-1.69545992\x20408.55421918\x20-1.64391704\x20413.0078125\x20-1.60546875\x20C417.78742565\x20-0.74920913\x20420.4011256\x202.49647845\x20423.66796875\x205.87109375\x20C424.98900183\x207.0310866\x20426.32161482\x208.17808815\x20427.66796875\x209.30859375\x20C428.65796875\x2010.15421875\x20429.64796875\x2010.99984375\x20430.66796875\x2011.87109375\x20C431.415625\x2011.10023437\x20432.16328125\x2010.329375\x20432.93359375\x209.53515625\x20C433.92811526\x208.52187019\x20434.92292198\x207.508864\x20435.91796875\x206.49609375\x20C436.40910156\x205.98820313\x20436.90023438\x205.4803125\x20437.40625\x204.95703125\x20C441.42179619\x200.88794445\x20444.26804138\x20-1.40259173\x20450.04296875\x20-1.50390625\x20C450.77257812\x20-1.53226562\x20451.5021875\x20-1.560625\x20452.25390625\x20-1.58984375\x20C458.25756862\x20-0.44351339\x20462.16703896\x204.22138966\x20466.04296875\x208.62109375\x20C466.91695313\x209.6059375\x20467.7909375\x2010.59078125\x20468.69140625\x2011.60546875\x20C469.34367187\x2012.353125\x20469.9959375\x2013.10078125\x20470.66796875\x2013.87109375\x20C475.35814617\x209.96261256\x20479.71862928\x205.89153229\x20483.96875\x201.5078125\x20C487.29434308\x20-1.69545992\x20490.55421918\x20-1.64391704\x20495.0078125\x20-1.60546875\x20C499.78742565\x20-0.74920913\x20502.4011256\x202.49647845\x20505.66796875\x205.87109375\x20C506.98900183\x207.0310866\x20508.32161482\x208.17808815\x20509.66796875\x209.30859375\x20C510.65796875\x2010.15421875\x20511.64796875\x2010.99984375\x20512.66796875\x2011.87109375\x20C513.93253906\x2010.58912109\x20513.93253906\x2010.58912109\x20515.22265625\x209.28125\x20C516.32929468\x208.16523328\x20517.43607277\x207.04935503\x20518.54296875\x205.93359375\x20C519.09855469\x205.36962891\x20519.65414062\x204.80566406\x20520.2265625\x204.22460938\x20C524.02537618\x200.40291127\x20525.93515189\x20-1.29270972\x20531.29296875\x20-1.56640625\x20C537.31013866\x20-1.48848606\x20540.47035581\x200.73599845\x20544.66796875\x204.87109375\x20C546.30159874\x206.64295397\x20547.85659678\x208.46012461\x20549.3984375\x2010.3125\x20C553.2588351\x2014.66458336\x20557.45179489\x2018.69310805\x20561.60180664\x2022.76733398\x20C562.23981201\x2023.39712158\x20562.87781738\x2024.02690918\x20563.53515625\x2024.67578125\x20C564.11378418\x2025.24280762\x20564.69241211\x2025.80983398\x20565.28857422\x2026.39404297\x20C578.60376365\x2040.65190068\x20567.66796875\x2065.36261415\x20567.66796875\x2084.87109375\x20C366.69796875\x2084.87109375\x20165.72796875\x2084.87109375\x20-41.33203125\x2084.87109375\x20C-41.33203125\x2028.76345515\x20-41.33203125\x2028.76345515\x20-26.04296875\x2013.39648438\x20C-25.55666992\x2012.91026611\x20-25.07037109\x2012.42404785\x20-24.56933594\x2011.9230957\x20C-23.06545494\x2010.41699295\x20-21.5698014\x208.9030102\x20-20.07421875\x207.38867188\x20C-19.11376959\x206.42529415\x20-18.15284948\x205.46238566\x20-17.19140625\x204.5\x20C-16.32999023\x203.6344751\x20-15.46857422\x202.7689502\x20-14.58105469\x201.87719727\x20C-10.45060807\x20-1.80711449\x20-5.01593417\x20-2.42814904\x200\x200\x20Z\x20\x22\x20transform=\x22translate(41.33203125,1.12890625)\x22/>\x0a\x20\x20\x20\x20\x20\x20</svg>\x0a\x20\x20\x20\x20</div>\x0a\x20\x20\x20\x20<div\x20class=\x22packace-center\x22><img\x20id=\x22package-image\x22\x20src=\x22\x22></div>\x0a\x20\x20\x20\x20<div\x20class=\x22tear-border-2\x22>\x0a\x20\x20\x20\x20\x20\x20<svg\x20version=\x221.1\x22\x20xmlns=\x22http://www.w3.org/2000/svg\x22\x20width=\x22609\x22\x20height=\x2286\x22>\x0a\x20\x20\x20\x20\x20\x20\x20\x20<path\x20d=\x22M0\x200\x20C200.97\x200\x20401.94\x200\x20609\x200\x20C609\x2056.1076386\x20609\x2056.1076386\x20593.7109375\x2071.47460938\x20C593.22463867\x2071.96082764\x20592.73833984\x2072.4470459\x20592.23730469\x2072.94799805\x20C590.73342369\x2074.4541008\x20589.23777015\x2075.96808355\x20587.7421875\x2077.48242188\x20C586.78173834\x2078.4457996\x20585.82081823\x2079.40870809\x20584.859375\x2080.37109375\x20C583.99795898\x2081.23661865\x20583.13654297\x2082.10214355\x20582.24902344\x2082.99389648\x20C579.34034581\x2085.58840409\x20577.49580399\x2085.96327378\x20573.625\x2086.25\x20C566.88494902\x2085.7851689\x20563.15816537\x2081.42440145\x20558.6875\x2076.8125\x20C557.86282227\x2075.97428711\x20557.86282227\x2075.97428711\x20557.02148438\x2075.11914062\x20C555.67636304\x2073.75062588\x20554.33753357\x2072.37593167\x20553\x2071\x20C548.64789472\x2074.64155748\x20544.57110648\x2078.3566318\x20540.67578125\x2082.484375\x20C537.09519172\x2085.72276367\x20533.85239958\x2086.47043387\x20529.00390625\x2086.30078125\x20C521.97677574\x2085.24602677\x20516.67956461\x2077.86674719\x20512\x2073\x20C508.12940728\x2074.57158637\x20505.79581391\x2077.06622825\x20502.9375\x2080.0625\x20C499.12160463\x2084.0620174\x20497.25919792\x2085.83265201\x20491.625\x2086.25\x20C484.88494902\x2085.7851689\x20481.15816537\x2081.42440145\x20476.6875\x2076.8125\x20C476.13771484\x2076.25369141\x20475.58792969\x2075.69488281\x20475.02148438\x2075.11914062\x20C473.67636304\x2073.75062588\x20472.33753357\x2072.37593167\x20471\x2071\x20C466.64789472\x2074.64155748\x20462.57110648\x2078.3566318\x20458.67578125\x2082.484375\x20C455.09419507\x2085.72366506\x20451.993903\x2086.24723509\x20447.1953125\x2086.4609375\x20C441.36359133\x2085.23648359\x20437.12234441\x2080.38855495\x20433.125\x2076.25\x20C432.62742187\x2075.74339844\x20432.12984375\x2075.23679687\x20431.6171875\x2074.71484375\x20C430.40676798\x2073.48114693\x20429.20270147\x2072.24122216\x20428\x2071\x20C423.30982258\x2074.90848119\x20418.94933947\x2078.97956146\x20414.69921875\x2083.36328125\x20C411.37362567\x2086.56655367\x20408.11374957\x2086.51501079\x20403.66015625\x2086.4765625\x20C398.8805431\x2085.62030288\x20396.26684315\x2082.3746153\x20393\x2079\x20C391.67896692\x2077.84000715\x20390.34635393\x2076.6930056\x20389\x2075.5625\x20C388.01\x2074.716875\x20387.02\x2073.87125\x20386\x2073\x20C385.25234375\x2073.77085938\x20384.5046875\x2074.54171875\x20383.734375\x2075.3359375\x20C382.73985349\x2076.34922356\x20381.74504677\x2077.36222975\x20380.75\x2078.375\x20C380.25886719\x2078.88289063\x20379.76773437\x2079.39078125\x20379.26171875\x2079.9140625\x20C375.24617256\x2083.9831493\x20372.39992737\x2086.27368548\x20366.625\x2086.375\x20C357.40542571\x2086.07517645\x20352.00747242\x2078.22117697\x20346\x2072\x20C341.95864413\x2073.59930434\x20339.32092848\x2076.48660409\x20336.375\x2079.5625\x20C330.0126103\x2086.15092196\x20330.0126103\x2086.15092196\x20324.375\x2086.5\x20C319.01467089\x2086.44601107\x20316.61041195\x2084.73175022\x20312.89453125\x2081.0234375\x20C312.26933594\x2080.35570313\x20311.64414062\x2079.68796875\x20311\x2079\x20C309.66819341\x2077.68595083\x20308.33494145\x2076.37336435\x20307\x2075.0625\x20C305.99739287\x2074.04422713\x20304.99636187\x2073.02438455\x20304\x2072\x20C299.10208197\x2073.99083966\x20296.08836016\x2077.9091317\x20292.53515625\x2081.6875\x20C288.99739343\x2084.91455021\x20286.27646893\x2085.86074884\x20281.5625\x2086.375\x20C273.40638624\x2085.51646171\x20268.4076181\x2078.62392282\x20263\x2073\x20C259.12940728\x2074.57158637\x20256.79581391\x2077.06622825\x20253.9375\x2080.0625\x20C250.12160463\x2084.0620174\x20248.25919792\x2085.83265201\x20242.625\x2086.25\x20C235.88494902\x2085.7851689\x20232.15816537\x2081.42440145\x20227.6875\x2076.8125\x20C227.13771484\x2076.25369141\x20226.58792969\x2075.69488281\x20226.02148438\x2075.11914062\x20C224.67636304\x2073.75062588\x20223.33753357\x2072.37593167\x20222\x2071\x20C217.64789472\x2074.64155748\x20213.57110648\x2078.3566318\x20209.67578125\x2082.484375\x20C206.7564577\x2085.1246956\x20204.54788677\x2085.94926974\x20200.625\x2086.3125\x20C193.45113375\x2085.69406325\x20189.36431222\x2081.78000133\x20184.625\x2076.8125\x20C184.07972656\x2076.25369141\x20183.53445312\x2075.69488281\x20182.97265625\x2075.11914062\x20C181.64143231\x2073.75288448\x20180.3197169\x2072.37737443\x20179\x2071\x20C174.30982258\x2074.90848119\x20169.94933947\x2078.97956146\x20165.69921875\x2083.36328125\x20C162.37362567\x2086.56655367\x20159.11374957\x2086.51501079\x20154.66015625\x2086.4765625\x20C149.8805431\x2085.62030288\x20147.26684315\x2082.3746153\x20144\x2079\x20C142.67896692\x2077.84000715\x20141.34635393\x2076.6930056\x20140\x2075.5625\x20C139.01\x2074.716875\x20138.02\x2073.87125\x20137\x2073\x20C135.87851562\x2074.15628906\x20135.87851562\x2074.15628906\x20134.734375\x2075.3359375\x20C133.73985349\x2076.34922356\x20132.74504677\x2077.36222975\x20131.75\x2078.375\x20C131.25886719\x2078.88289063\x20130.76773438\x2079.39078125\x20130.26171875\x2079.9140625\x20C126.24617256\x2083.9831493\x20123.39992737\x2086.27368548\x20117.625\x2086.375\x20C116.89539063\x2086.40335937\x20116.16578125\x2086.43171875\x20115.4140625\x2086.4609375\x20C109.41040013\x2085.31460714\x20105.50092979\x2080.64970409\x20101.625\x2076.25\x20C100.75101562\x2075.26515625\x2099.87703125\x2074.2803125\x2098.9765625\x2073.265625\x20C98.32429688\x2072.51796875\x2097.67203125\x2071.7703125\x2097\x2071\x20C92.30982258\x2074.90848119\x2087.94933947\x2078.97956146\x2083.69921875\x2083.36328125\x20C80.37362567\x2086.56655367\x2077.11374957\x2086.51501079\x2072.66015625\x2086.4765625\x20C67.8805431\x2085.62030288\x2065.26684315\x2082.3746153\x2062\x2079\x20C60.67896692\x2077.84000715\x2059.34635393\x2076.6930056\x2058\x2075.5625\x20C57.01\x2074.716875\x2056.02\x2073.87125\x2055\x2073\x20C54.15695313\x2073.85464844\x2053.31390625\x2074.70929688\x2052.4453125\x2075.58984375\x20C51.33867407\x2076.70586047\x2050.23189598\x2077.82173872\x2049.125\x2078.9375\x20C48.56941406\x2079.50146484\x2048.01382813\x2080.06542969\x2047.44140625\x2080.64648438\x20C43.64259257\x2084.46818248\x2041.73281686\x2086.16380347\x2036.375\x2086.4375\x20C30.35783009\x2086.35957981\x2027.19761294\x2084.1350953\x2023\x2080\x20C21.36637001\x2078.22813978\x2019.81137197\x2076.41096914\x2018.26953125\x2074.55859375\x20C14.40913365\x2070.20651039\x2010.21617386\x2066.1779857\x206.06616211\x2062.10375977\x20C5.42815674\x2061.47397217\x204.79015137\x2060.84418457\x204.1328125\x2060.1953125\x20C3.55418457\x2059.62828613\x202.97555664\x2059.06125977\x202.37939453\x2058.47705078\x20C-10.9357949\x2044.21919307\x200\x2019.5084796\x200\x200\x20Z\x20\x22\x20transform=\x22translate(0,0)\x22/>\x0a\x20\x20\x20\x20\x20\x20</svg>\x0a\x20\x20\x20\x20</div>\x0a\x20\x20</div>\x0a\x20\x20<div\x20class=\x22card-placeholder\x22></div>\x0a\x20\x20\x20\x20<div\x20class=\x22card-box\x22>\x0a\x20\x20\x20\x20\x20\x20<div\x20class=\x22holographic-overlay\x22></div>\x0a\x20\x20\x20\x20\x20\x20<span\x20class=\x22card-label\x22>new</span>\x0a\x20\x20\x20\x20\x20\x20<div\x20class=\x22main-card\x22>\x0a\x20\x20\x20\x20\x20\x20\x20\x20<div\x20class=\x22card-number-1\x22>\x0a\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20<span>1</span>\x0a\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20<span\x20class=\x22icon-heart\x22>\x0a\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20<svg\x20xmlns=\x22http://www.w3.org/2000/svg\x22\x20viewBox=\x220\x200\x20512\x20512\x22\x20width=\x2216\x22\x20height=\x2216\x22\x20fill=\x22currentColor\x22>\x0a\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20<path\x20d=\x22M47.6\x20300.4L228.3\x20469.1c7.5\x207\x2017.4\x2010.9\x2027.7\x2010.9s20.2-3.9\x2027.7-10.9L464.4\x20300.4c30.4-28.3\x2047.6-68\x2047.6-109.5v-5.8c0-69.9-50.5-129.5-119.4-141C347\x2036.5\x20300.6\x2051.4\x20268\x2084L256\x2096\x20244\x2084c-32.6-32.6-79-47.5-124.6-39.9C50.5\x2055.6\x200\x20115.2\x200\x20185.1v5.8c0\x2041.5\x2017.2\x2081.2\x2047.6\x20109.5z\x22/>\x0a\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20</svg>\x0a\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20</span>\x0a\x20\x20\x20\x20\x20\x20\x20\x20</div>\x0a\x20\x20\x20\x20\x20\x20\x20\x20<svg\x20class=\x22corner-svg-1\x22\x20xmlns=\x22http://www.w3.org/2000/svg\x22\x20width=\x22703\x22\x20height=\x221177\x22\x20style=\x22transform:\x20scale(0.077);\x20transform-origin:\x20top\x20left;\x22>\x0a\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20<path\x20d=\x22M0\x200\x20C231.99\x200\x20463.98\x200\x20703\x200\x20C703\x2022.44\x20703\x2044.88\x20703\x2068\x20C695.55179688\x2068.07347656\x20695.55179688\x2068.07347656\x20687.953125\x2068.1484375\x20C684.76300329\x2068.18392068\x20681.57290451\x2068.21993525\x20678.3828125\x2068.2578125\x20C673.34541537\x2068.31757456\x20668.30804942\x2068.37561692\x20663.27050781\x2068.421875\x20C619.4648285\x2068.82978793\x20582.43843949\x2072.52174489\x20549\x20104\x20C548.39671875\x20104.53882812\x20547.7934375\x20105.07765625\x20547.171875\x20105.6328125\x20C529.70679682\x20121.87370296\x20518.16928721\x20147.50777027\x20515.2890625\x20170.91796875\x20C515\x20173\x20515\x20173\x20514\x20175\x20C513.90585361\x20176.48475573\x20513.87434957\x20177.9736961\x20513.87399215\x20179.46143365\x20C513.87133634\x20180.40778005\x20513.86868053\x20181.35412645\x20513.86594424\x20182.32915002\x20C513.86811029\x20183.37807969\x20513.87027635\x20184.42700935\x20513.87250805\x20185.50772476\x20C513.87086422\x20186.61945633\x20513.86922038\x20187.73118791\x20513.86752674\x20188.87660831\x20C513.86317391\x20192.64661265\x20513.86599856\x20196.41657904\x20513.86869812\x20200.18658447\x20C513.8675585\x20202.89912541\x20513.86489513\x20205.61166434\x20513.86228687\x20208.32420421\x20C513.85738211\x20214.24529711\x20513.85614303\x20220.16638203\x20513.85725212\x20226.08747673\x20C513.8588588\x20234.89318509\x20513.85470688\x20243.69888395\x20513.84917164\x20252.50459039\x20C513.84050858\x20266.41096438\x20513.83515464\x20280.31733713\x20513.83197013\x20294.22371337\x20C513.82683044\x20316.31668146\x20513.8113677\x20338.40963337\x20513.79239365\x20360.50259348\x20C513.78837187\x20365.20350711\x20513.784451\x20369.90442081\x20513.78052729\x20374.60533452\x20C513.77974464\x20375.54253454\x20513.77896198\x20376.47973456\x20513.77815561\x20377.44533458\x20C513.77657001\x20379.3445781\x20513.77498518\x20381.24382162\x20513.77340112\x20383.14306514\x20C513.77180983\x20385.04942205\x20513.77021558\x20386.95577895\x20513.76861839\x20388.86213586\x20C513.74977615\x20411.35877299\x20513.73269745\x20433.85541121\x20513.71704102\x20456.35205078\x20C513.71600764\x20457.8290236\x20513.71600764\x20457.8290236\x20513.71495338\x20459.33583426\x20C513.69271666\x20491.22838843\x20513.68086019\x20523.12093792\x20513.67337446\x20555.01349859\x20C513.66560156\x20587.8052216\x20513.64450855\x20620.59691269\x20513.60783185\x20653.38861659\x20C513.60265848\x20658.02516797\x20513.59765106\x20662.66171951\x20513.59275246\x20667.29827118\x20C513.5917855\x20668.21075734\x20513.59081854\x20669.1232435\x20513.58982228\x20670.06338076\x20C513.57470605\x20684.72240326\x20513.57378152\x20699.38139369\x20513.57840959\x20714.04042185\x20C513.58280447\x20728.79371881\x20513.57282122\x20743.54695032\x20513.54832252\x20758.30022809\x20C513.53423365\x20767.05394149\x20513.53113698\x20775.80749411\x20513.54416505\x20784.56121001\x20C513.55178723\x20790.42421575\x20513.54470894\x20796.28709029\x20513.52618354\x20802.15007125\x20C513.51606826\x20805.4808263\x20513.51413568\x20808.81100037\x20513.52580877\x20812.14178827\x20C513.66653066\x20855.75152816\x20500.95771402\x20895.76665035\x20472\x20929\x20C471.16984375\x20929.96421875\x20470.3396875\x20930.9284375\x20469.484375\x20931.921875\x20C442.0538574\x20963.18463463\x20402.98923101\x20981.85104431\x20362\x20987\x20C359.3613991\x20987.085575\x20356.75075854\x20987.12954808\x20354.11331177\x20987.11784363\x20C352.9669866\x20987.1189005\x20352.9669866\x20987.1189005\x20351.79750335\x20987.11997873\x20C349.25186068\x20987.12128083\x20346.70628082\x20987.11562668\x20344.16064453\x20987.11010742\x20C342.32827758\x20987.10986509\x20340.49591051\x20987.11014311\x20338.6635437\x20987.11090088\x20C334.72129015\x20987.11200545\x20330.77904827\x20987.11057815\x20326.83679581\x20987.10753441\x20C320.5788254\x20987.10388717\x20314.32091495\x20987.11307391\x20308.06295776\x20987.12532043\x20C307.00378336\x20987.12734236\x20305.94460896\x20987.12936429\x20304.85333836\x20987.13144749\x20C302.68724689\x20987.13561633\x20300.52115549\x20987.13981908\x20298.35506415\x20987.14405501\x20C283.79608183\x20987.17210296\x20269.23722906\x20987.19242056\x20254.67822266\x20987.17504883\x20C244.84663617\x20987.16341409\x20235.01531993\x20987.17331449\x20225.1837815\x20987.20710641\x20C219.99453223\x20987.22411008\x20214.80577\x20987.23078184\x20209.61651993\x20987.210989\x20C181.70732325\x20987.11275934\x20156.40672932\x20988.09031619\x20131\x201001\x20C130.01257813\x201001.48210938\x20129.02515625\x201001.96421875\x20128.0078125\x201002.4609375\x20C101.79171648\x201015.90318503\x2081.74909053\x201040.57730608\x2072.20214844\x201068.31835938\x20C71.45839088\x201070.67996109\x2070.77550526\x201073.04860111\x2070.125\x201075.4375\x20C69.93389648\x201076.12674561\x2069.74279297\x201076.81599121\x2069.54589844\x201077.52612305\x20C66.02176022\x201091.65625439\x2065.69379231\x201106.46050338\x2065.5859375\x201120.9453125\x20C65.56715455\x201122.57869363\x2065.54757635\x201124.21206579\x2065.5272522\x201125.84542847\x20C65.47667543\x201130.07674785\x2065.4366596\x201134.30809845\x2065.39910889\x201138.53955078\x20C65.35142837\x201143.65283387\x2065.29016065\x201148.76597132\x2065.23126221\x201153.87913513\x20C65.14396194\x201161.58602884\x2065.07354834\x201169.29290772\x2065\x201177\x20C43.55\x201177\x2022.1\x201177\x200\x201177\x20C0\x20788.59\x200\x20400.18\x200\x200\x20Z\x22\x20/>\x0a\x20\x20\x20\x20\x20\x20\x20\x20</svg>\x0a\x20\x20\x20\x20\x20\x20\x20\x20<div\x20class=\x22card-number-2\x22>\x0a\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20<span>1</span>\x0a\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20<span\x20class=\x22icon-heart\x22>\x0a\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20<svg\x20xmlns=\x22http://www.w3.org/2000/svg\x22\x20viewBox=\x220\x200\x20512\x20512\x22\x20width=\x2216\x22\x20height=\x2216\x22\x20fill=\x22currentColor\x22>\x0a\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20<path\x20d=\x22M47.6\x20300.4L228.3\x20469.1c7.5\x207\x2017.4\x2010.9\x2027.7\x2010.9s20.2-3.9\x2027.7-10.9L464.4\x20300.4c30.4-28.3\x2047.6-68\x2047.6-109.5v-5.8c0-69.9-50.5-129.5-119.4-141C347\x2036.5\x20300.6\x2051.4\x20268\x2084L256\x2096\x20244\x2084c-32.6-32.6-79-47.5-124.6-39.9C50.5\x2055.6\x200\x20115.2\x200\x20185.1v5.8c0\x2041.5\x2017.2\x2081.2\x2047.6\x20109.5z\x22/>\x0a\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20</svg>\x0a\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20</span>\x0a\x20\x20\x20\x20\x20\x20\x20\x20</div>\x0a\x20\x20\x20\x20\x20\x20\x20\x20<svg\x20class=\x22corner-svg-2\x22\x20xmlns=\x22http://www.w3.org/2000/svg\x22\x20width=\x22703\x22\x20height=\x221177\x22\x20style=\x22transform:\x20scale(0.077);\x20transform-origin:\x20bottom\x20right;\x22>\x0a\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20<path\x20d=\x22M0\x200\x20C21.45\x200\x2042.9\x200\x2065\x200\x20C65\x20388.41\x2065\x20776.82\x2065\x201177\x20C-166.99\x201177\x20-398.98\x201177\x20-638\x201177\x20C-638\x201154.56\x20-638\x201132.12\x20-638\x201109\x20C-633.03453125\x201108.95101563\x20-628.0690625\x201108.90203125\x20-622.953125\x201108.8515625\x20C-619.76300329\x201108.81607932\x20-616.57290451\x201108.78006475\x20-613.3828125\x201108.7421875\x20C-608.34541537\x201108.68242544\x20-603.30804942\x201108.62438308\x20-598.27050781\x201108.578125\x20C-554.4648285\x201108.17021207\x20-517.43843949\x201104.47825511\x20-484\x201073\x20C-483.09507812\x201072.19175781\x20-483.09507812\x201072.19175781\x20-482.171875\x201071.3671875\x20C-464.70679682\x201055.12629704\x20-453.16928721\x201029.49222973\x20-450.2890625\x201006.08203125\x20C-450\x201004\x20-450\x201004\x20-449\x201002\x20C-448.90585361\x201000.51524427\x20-448.87434957\x20999.0263039\x20-448.87399215\x20997.53856635\x20C-448.87133634\x20996.59221995\x20-448.86868053\x20995.64587355\x20-448.86594424\x20994.67084998\x20C-448.86811029\x20993.62192031\x20-448.87027635\x20992.57299065\x20-448.87250805\x20991.49227524\x20C-448.87086422\x20990.38054367\x20-448.86922038\x20989.26881209\x20-448.86752674\x20988.12339169\x20C-448.86317391\x20984.35338735\x20-448.86599856\x20980.58342096\x20-448.86869812\x20976.81341553\x20C-448.8675585\x20974.10087459\x20-448.86489513\x20971.38833566\x20-448.86228687\x20968.67579579\x20C-448.85738211\x20962.75470289\x20-448.85614303\x20956.83361797\x20-448.85725212\x20950.91252327\x20C-448.8588588\x20942.10681491\x20-448.85470688\x20933.30111605\x20-448.84917164\x20924.49540961\x20C-448.84050858\x20910.58903562\x20-448.83515464\x20896.68266287\x20-448.83197013\x20882.77628663\x20C-448.82683044\x20860.68331854\x20-448.8113677\x20838.59036663\x20-448.79239365\x20816.49740652\x20C-448.78837187\x20811.79649289\x20-448.784451\x20807.09557919\x20-448.78052729\x20802.39466548\x20C-448.77974464\x20801.45746546\x20-448.77896198\x20800.52026544\x20-448.77815561\x20799.55466542\x20C-448.77657001\x20797.6554219\x20-448.77498518\x20795.75617838\x20-448.77340112\x20793.85693486\x20C-448.77180983\x20791.95057795\x20-448.77021558\x20790.04422105\x20-448.76861839\x20788.13786414\x20C-448.74977615\x20765.64122701\x20-448.73269745\x20743.14458879\x20-448.71704102\x20720.64794922\x20C-448.7163521\x20719.66330067\x20-448.71566318\x20718.67865212\x20-448.71495338\x20717.66416574\x20C-448.69271666\x20685.77161157\x20-448.68086019\x20653.87906208\x20-448.67337446\x20621.98650141\x20C-448.66560156\x20589.1947784\x20-448.64450855\x20556.40308731\x20-448.60783185\x20523.61138341\x20C-448.60265848\x20518.97483203\x20-448.59765106\x20514.33828049\x20-448.59275246\x20509.70172882\x20C-448.5917855\x20508.78924266\x20-448.59081854\x20507.8767565\x20-448.58982228\x20506.93661924\x20C-448.57470605\x20492.27759674\x20-448.57378152\x20477.61860631\x20-448.57840959\x20462.95957815\x20C-448.58280447\x20448.20628119\x20-448.57282122\x20433.45304968\x20-448.54832252\x20418.69977191\x20C-448.53423365\x20409.94605851\x20-448.53113698\x20401.19250589\x20-448.54416505\x20392.43878999\x20C-448.55178723\x20386.57578425\x20-448.54470894\x20380.71290971\x20-448.52618354\x20374.84992875\x20C-448.51606826\x20371.5191737\x20-448.51413568\x20368.18899963\x20-448.52580877\x20364.85821173\x20C-448.66653066\x20321.24847184\x20-435.95771402\x20281.23334965\x20-407\x20248\x20C-406.16984375\x20247.03578125\x20-405.3396875\x20246.0715625\x20-404.484375\x20245.078125\x20C-377.0538574\x20213.81536537\x20-337.98923101\x20195.14895569\x20-297\x20190\x20C-294.3613991\x20189.914425\x20-291.75075854\x20189.87045192\x20-289.11331177\x20189.88215637\x20C-288.34909499\x20189.88145179\x20-287.58487821\x20189.88074721\x20-286.79750335\x20189.88002127\x20C-284.25186068\x20189.87871917\x20-281.70628082\x20189.88437332\x20-279.16064453\x20189.88989258\x20C-277.32827758\x20189.89013491\x20-275.49591051\x20189.88985689\x20-273.6635437\x20189.88909912\x20C-269.72129015\x20189.88799455\x20-265.77904827\x20189.88942185\x20-261.83679581\x20189.89246559\x20C-255.5788254\x20189.89611283\x20-249.32091495\x20189.88692609\x20-243.06295776\x20189.87467957\x20C-242.00378336\x20189.87265764\x20-240.94460896\x20189.87063571\x20-239.85333836\x20189.86855251\x20C-237.68724689\x20189.86438367\x20-235.52115549\x20189.86018092\x20-233.35506415\x20189.85594499\x20C-218.79608183\x20189.82789704\x20-204.23722906\x20189.80757944\x20-189.67822266\x20189.82495117\x20C-179.84663617\x20189.83658591\x20-170.01531993\x20189.82668551\x20-160.1837815\x20189.79289359\x20C-154.99453223\x20189.77588992\x20-149.80577\x20189.76921816\x20-144.61651993\x20189.789011\x20C-116.70732325\x20189.88724066\x20-91.40672932\x20188.90968381\x20-66\x20176\x20C-64.51886719\x20175.27683594\x20-64.51886719\x20175.27683594\x20-63.0078125\x20174.5390625\x20C-36.79171648\x20161.09681497\x20-16.74909053\x20136.42269392\x20-7.20214844\x20108.68164062\x20C-6.45839088\x20106.32003891\x20-5.77550526\x20103.95139889\x20-5.125\x20101.5625\x20C-4.93389648\x20100.87325439\x20-4.74279297\x20100.18400879\x20-4.54589844\x2099.47387695\x20C-1.02176022\x2085.34374561\x20-0.69379231\x2070.53949662\x20-0.5859375\x2056.0546875\x20C-0.56715455\x2054.42130637\x20-0.54757635\x2052.78793421\x20-0.5272522\x2051.15457153\x20C-0.47667543\x2046.92325215\x20-0.4366596\x2042.69190155\x20-0.39910889\x2038.46044922\x20C-0.35142837\x2033.34716613\x20-0.29016065\x2028.23402868\x20-0.23126221\x2023.12086487\x20C-0.14396194\x2015.41397116\x20-0.07354834\x207.70709228\x200\x200\x20Z\x20\x22\x20transform=\x22translate(638,0)\x22/>\x0a\x20\x20\x20\x20\x20\x20\x20\x20</svg>\x0a\x20\x20\x20\x20\x20\x20\x20\x20<div\x20class=\x22card-info-overlay\x22>\x0a\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20<div\x20class=\x22card-name\x22></div>\x0a\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20<div\x20class=\x22card-stars\x22></div>\x0a\x20\x20\x20\x20\x20\x20\x20\x20</div>\x0a\x20\x20\x20\x20\x20\x20</div>\x0a\x20\x20\x20\x20</div>\x0a\x20\x20\x20\x20\x20\x20<div\x20class=\x22radial-container\x22>\x0a\x20\x20\x20\x20\x20\x20\x20\x20<div\x20class=\x22fade-square\x22\x20style=\x22--i:\x200;\x22></div>\x0a\x20\x20\x20\x20\x20\x20\x20\x20<div\x20class=\x22fade-square\x22\x20style=\x22--i:\x201;\x22></div>\x0a\x20\x20\x20\x20\x20\x20\x20\x20<div\x20class=\x22fade-square\x22\x20style=\x22--i:\x202;\x22></div>\x0a\x20\x20\x20\x20\x20\x20\x20\x20<div\x20class=\x22fade-square\x22\x20style=\x22--i:\x203;\x22></div>\x0a\x20\x20\x20\x20\x20\x20\x20\x20<div\x20class=\x22fade-square\x22\x20style=\x22--i:\x204;\x22></div>\x0a\x20\x20\x20\x20\x20\x20\x20\x20<div\x20class=\x22fade-square\x22\x20style=\x22--i:\x205;\x22></div>\x0a\x20\x20\x20\x20\x20\x20\x20\x20<div\x20class=\x22fade-square\x22\x20style=\x22--i:\x206;\x22></div>\x0a\x20\x20\x20\x20\x20\x20\x20\x20<div\x20class=\x22fade-square\x22\x20style=\x22--i:\x207;\x22></div>\x0a\x20\x20\x20\x20\x20\x20</div>\x0a\x20\x20\x20\x20<div\x20class=\x22card-info\x22>\x0a\x20\x20\x20\x20\x20\x20<div\x20class=\x22user-text\x22></div>\x0a\x20\x20\x20\x20\x20\x20<div\x20class=\x22card-mini-list\x22></div>\x0a\x20\x20\x20\x20</div>\x0a\x20\x20</div>\x0a\x20\x20', 'revealedCardsByUser', 'hasOwnProperty', '✅\x20Added\x20card\x20#', 'alert', 'toLowerCase', '❌\x20Failed\x20to\x20reset\x20data\x20for\x20user\x20', '900', 'follower-latest', '!resetcollection', 'probability', '⚠️\x20Invalid\x20card\x20number.', 'Reward\x20redeemed:', 'authorDetails', 'cheer-latest', 'createElement', 'displayName', '⚠️\x20Usage:\x20!giftpack\x20username', '❌\x20Failed\x20to\x20save\x20revealed\x20cards\x20[', 'random', 'getElementById', 'cheerEffect', '\x20already\x20has\x20card\x20#', 'pointsReward2', 'addEventListener', '📥\x20Event\x20received:', 'add', 'giftPack', 'Stars', '.mini-question', '⚠️\x20No\x20collection\x20named\x20', 'shift', '⚠️\x20Usage:\x20!resetcollection\x20collectionName', '⚠️\x20User\x20', '.tear-border-1', 'catch', 'none', 'scale(0)', 'name', '💾\x20Saved\x20revealed\x20cards:', '4hSeJoR', '.package-container', 'tipEffect', 'stars', '.card-number-2\x20span', '✅\x20All\x20saved\x20cards\x20were\x20cleared\x20from\x20[', '.card-mini-list', 'SE_API', 'mod', 'style', 'mini-card', 'absolute', 'card', '\x20collection\x20reset', '.card-number-1\x20span', 'get', 'packageImage', 'transform', 'cardTime', '.user-text', '\x20got:', 'subscriber-latest', 'Card\x20', 'block', '9LUHknC', 'center', 'log', 'holographic-animate', 'includes', 'mini-question', 'white', 'https://cdn.freesound.org/previews/186/186719_105499-lq.mp3', 'repeat', '.holographic-overlay', '.card-info-overlay', '🔄\x20Reset\x20for\x20', '.radial-container', '33px', 'no-repeat', 'field', 'animation', 'redemption', 'event', 'fieldData', 'broadcaster/1', 'data', 'subEffect', '6707744JtRkdD', 'resetUser', 'onWidgetLoad', '528888yfWuih', 'span', 'volume', 'isCommunityGift', 'tags', 'cover', '🔄\x20', '🎴\x20Added\x20card\x20#', '⚠️\x20Failed\x20to\x20load\x20revealed\x20cards\x20from\x20storage\x20[', 'length', 'number', 'filter', 'amount', 'appendChild', '❌\x20Error\x20saving\x20new\x20card', 'tearBorderIn\x204.5s', '.card-label', '50%', 'package-image', 'image', 'div', '5owYzfj', 'pointsReward3', '.card-wrapper', 'totalCards', 'backgroundRepeat', '💾\x20Saved\x20arrays:', 'display', 'fontSize', 'visibility', '✅\x20Loaded\x20cards\x20for\x20', 'Name', 'superchat-latest', '🧾\x20Full\x20data:', 'addCardUser', 'listener', 'textContent', 'opacity', '12165475xrAOZV', '🎁\x20Gift\x20pack\x20for\x20', 'then', '\x20collection:', 'Image', 'Percentage', 'play', 'position', 'backgroundColor', 'backgroundPosition', '.card-info', '.mini-card', 'Reward\x20Field:', 'classList', 'min', 'transparent', 'left', 'testCardButton', 'trim', 'minSuperchat', 'scale(1)', 'border', 'backgroundSize', 'error', 'store', 'someone', 'relative', 'innerText', 'type', 'superchatEffect', '❌\x20Failed\x20to\x20reset\x20saved\x20data\x20for\x20[', 'cardCollectionName', 'allowVIPs', 'badges', 'backgroundImage', '⚠️\x20Usage:\x20!addcard\x20username\x20cardNumber', 'split', 'allowMods', 'querySelector', 'push', 'translate(-50%,\x20-50%)', 'hidden', '.card-box', '\x20found', 'cardSoundVolume', 'minCheer', 'fontFamily', 'text', '\x0a\x20\x20\x20\x20<svg\x20viewBox=\x220\x200\x2024\x2024\x22\x20fill=\x22none\x22\x20xmlns=\x22http://www.w3.org/2000/svg\x22\x20style=\x22margin-right:\x202px;\x22>\x0a\x20\x20\x20\x20\x20\x20<path\x20d=\x22M9.15316\x205.40838C10.4198\x203.13613\x2011.0531\x202\x2012\x202C12.9469\x202\x2013.5802\x203.13612\x2014.8468\x205.40837L15.1745\x205.99623C15.5345\x206.64193\x2015.7144\x206.96479\x2015.9951\x207.17781C16.2757\x207.39083\x2016.6251\x207.4699\x2017.3241\x207.62805L17.9605\x207.77203C20.4201\x208.32856\x2021.65\x208.60682\x2021.9426\x209.54773C22.2352\x2010.4886\x2021.3968\x2011.4691\x2019.7199\x2013.4299L19.2861\x2013.9372C18.8096\x2014.4944\x2018.5713\x2014.773\x2018.4641\x2015.1177C18.357\x2015.4624\x2018.393\x2015.8341\x2018.465\x2016.5776L18.5306\x2017.2544C18.7841\x2019.8706\x2018.9109\x2021.1787\x2018.1449\x2021.7602C17.3788\x2022.3417\x2016.2273\x2021.8115\x2013.9243\x2020.7512L13.3285\x2020.4768C12.6741\x2020.1755\x2012.3469\x2020.0248\x2012\x2020.0248C11.6531\x2020.0248\x2011.3259\x2020.1755\x2010.6715\x2020.4768L10.0757\x2020.7512C7.77268\x2021.8115\x206.62118\x2022.3417\x205.85515\x2021.7602C5.08912\x2021.1787\x205.21588\x2019.8706\x205.4694\x2017.2544L5.53498\x2016.5776C5.60703\x2015.8341\x205.64305\x2015.4624\x205.53586\x2015.1177C5.42868\x2014.773\x205.19043\x2014.4944\x204.71392\x2013.9372L4.2801\x2013.4299C2.60325\x2011.4691\x201.76482\x2010.4886\x202.05742\x209.54773C2.35002\x208.60682\x203.57986\x208.32856\x206.03954\x207.77203L6.67589\x207.62805C7.37485\x207.4699\x207.72433\x207.39083\x208.00494\x207.17781C8.28555\x206.96479\x208.46553\x206.64194\x208.82547\x205.99623L9.15316\x205.40838Z\x22></path>\x0a\x20\x20\x20\x20</svg>\x0a\x20\x20', '14735860GHlwoQ', 'gifted', 'reset-button-cards', '\x20span', 'innerHTML', 'collectionCommand', '.card-number-', '\x20to\x20', '630673RDLXvi', 'startsWith', 'src', '.container', '3px\x20solid\x20white', '❌\x20Failed\x20to\x20save\x20after\x20addcard:', '✅\x20All\x20saved\x20revealed\x20cards\x20were\x20cleared\x20for\x20[', 'reduce', 'hid', 'offsetWidth', '10481528tYcJUI', '⚠️\x20', 'url(\x27', '.main-card', '✅\x20Reset\x20revealed\x20cards\x20for\x20user:\x20', 'detail', 'pointerEvents', 'fontWeight'];
    _0x2f45 = function() {
        return _0x3ea40a;
    };
    return _0x2f45();
}