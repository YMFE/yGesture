(function(){
	var TOUCHKEYS = [
	        'screenX', 'screenY', 'clientX', 'clientY', 'pageX', 'pageY'
	    ], // 需要复制的属性
	    TOUCH_NUM = 2, // 最大支持触点数 1 或 2
	    TAP_TIMEOUT = 200, // 判断 tap 的延时
	    FLICK_TIMEOUT = 300, // 判断 flick 的延时
	    PAN_DISTANCE = 10, // 判定 pan 的位移偏移量
	    DIRECTION_DEG = 15, // 判断方向的角度
	    DOUBLETAP_GAP = 500, // double 判定延时
	    PINCH_DIS = 10; // 判定 pinch 的位移偏移量
	
	var curElement = null,
	    curVetor = null,
	    gestures = {},
	    lastTapTime = 0,
	    initialAngle = 0,
	    rotation = 0,
	    longTap = true,
	    enabled = true;
	
	var slice = Array.prototype.slice;
	
	// 绑定事件
	function addEvent(node, type, listener, useCapture) {
	    node.addEventListener(type, listener, !!useCapture);
	}
	
	// Array Make
	function makeArray(iterable) {
	    var n = iterable.length;
	    if (n === (n >>> 0)) {
	        try {
	            return slice.call(iterable);
	        } catch (e) {
	        }
	    }
	    return true;
	}
	
	// ready
	function ready(callback) {
	    if (/complete|loaded|interactive/.test(document.readyState) && document.body) {
	        callback();
	    } else {
	        addEvent(document, 'DOMContentLoaded', function () {
	            callback();
	        });
	    }
	}
	
	
	// 是否支持多指
	function supportMulti() {
	    return TOUCH_NUM == 2;
	}
	
	// 获取 obj 中 key 的数量
	function getKeys(obj) {
	    return Object.getOwnPropertyNames(obj);
	}
	
	// 判断对象是否为空
	function isEmpty(obj) {
	    return getKeys(obj).length === 0;
	}
	
	// fix：safari可能是文本节点
	function fixElement(el) {
	    return 'tagName' in el ? el : el.parentNode;
	}
	
	// 创建事件对象
	function createEvent(type) {
	    var event = document.createEvent("HTMLEvents");
	    event.initEvent(type, true, true);
	    return event;
	}
	
	// 触发事件
	function trigger(curElement, event) {
	    if (enabled && curElement && curElement.dispatchEvent) {
	        curElement.dispatchEvent(event);
	    }
	}
	
	// 复制 touch 对象上的有用属性到固定对象上
	function mixTouchAttr(target, source) {
	    TOUCHKEYS.forEach(function(key) {
	        target[key] = source[key];
	    });
	    return target;
	}
	
	// 获取方向
	function getDirection(offsetX, offsetY) {
	    var ret = [],
	        absX = Math.abs(offsetX),
	        absY = Math.abs(offsetY),
	        proportion = Math.tan(DIRECTION_DEG / 180 * Math.PI),
	        transverse = absX > absY;
	
	    if (absX > 0 || absY > 0) {
	        ret.push(transverse ? offsetX > 0 ? 'right' : 'left' : offsetY > 0 ? 'down' : 'up');
	        if (transverse && absY / absX > proportion) {
	            ret.push(offsetY > 0 ? 'down' : 'up');
	        } else if (!transverse && absX / absY > proportion) {
	            ret.push(offsetX > 0 ? 'right' : 'left');
	        }
	    }
	
	    return ret;
	}
	
	// 计算距离
	function computeDistance(offsetX, offsetY) {
	    return Math.sqrt(Math.pow(offsetX, 2) + Math.pow(offsetY, 2));
	}
	
	// 计算角度
	function computeDegree(offsetX, offsetY) {
	    var degree = Math.atan2(offsetY, offsetX) / Math.PI * 180;
	    return degree < 0 ? degree + 360 : degree;
	}
	
	// 计算角度，返回（0-180）
	function computeDegree180(offsetX, offsetY) {
	    var degree = Math.atan(offsetY * -1 / offsetX) / Math.PI * 180;
	    return degree < 0 ? degree + 180 : degree;
	}
	
	// 获取偏转角
	function getAngleDiff(offsetX, offsetY) {
	    var diff = initialAngle - computeDegree180(offsetX, offsetY);
	
	    while (Math.abs(diff - rotation) > 90) {
	        if (rotation < 0) {
	            diff -= 180;
	        } else {
	            diff += 180;
	        }
	    }
	    rotation = diff;
	    return rotation;
	}
	
	// 构造 pan / flick / panend 事件
	function createPanEvent(type, offsetX, offsetY, touch, duration) {
	    var ev = createEvent(type);
	    ev.offsetX = offsetX;
	    ev.offsetY = offsetY;
	    ev.degree = computeDegree(offsetX, offsetY);
	    ev.directions = getDirection(offsetX, offsetY);
	    if (duration) {
	        ev.duration = duration;
	        ev.speedX = ev.offsetX / duration;
	        ev.speedY = ev.offsetY / duration;
	    }
	    return mixTouchAttr(ev, touch);
	}
	
	// 构造 pinch 事件
	function createMultiEvent(type, centerX, centerY, scale, deflection, touch1, touch2) {
	    var ev = createEvent(type);
	    ev.centerX = centerX;
	    ev.centerY = centerY;
	    if (scale !== void 0) {
	        ev.scale = scale;
	    }
	    if (deflection !== void 0) {
	        ev.deflection = deflection;
	    }
	    ev.touchs = [touch1, touch2];
	    return ev;
	}
	
	// 判断是否处理完所有触点
	function checkEnd() {
	    var flag = true;
	    for (var key in gestures) {
	        if (gestures[key].status != 'end') {
	            flag = false;
	            break;
	        }
	    }
	    return flag;
	}
	
	ready(function() {
	    var body = document.body;
	
	    // 处理 touchstart 事件
	    function touchStart(event) {
	
	        // 判定现在是否开始手势判定
	        if (isEmpty(gestures)) {
	            // 获取第一个触点的Element
	            curElement = fixElement(event.touches[0].target);
	        }
	
	        // 遍历每一个 touch 对象，进行处理
	        makeArray(event.changedTouches).forEach(function(touch, index) {
	            var keys = getKeys(gestures);
	            if (keys.length < TOUCH_NUM) {
	                var origin = mixTouchAttr({}, touch),
	                    gesture = {
	                        startTouch: origin,
	                        curTouch: origin,
	                        startTime: Date.now(),
	                        status: 'tapping',
	                        other: null,
	                        handler: setTimeout(function() {
	                            if (gesture) {
	                                if (gesture.status == 'tapping') {
	                                    gesture.status = 'pressing';
	                                    trigger(curElement, mixTouchAttr(createEvent('press'), origin));
	                                }
	                                clearTimeout(gesture.handler);
	                                gesture.handler = null;
	                            }
	                        }, TAP_TIMEOUT)
	                    };
	
	                trigger(curElement, mixTouchAttr(createEvent('feel'), origin));
	
	                // 每一次手势不同触点的 identifier 是不同的
	                gestures[touch.identifier] = gesture;
	
	                if (supportMulti() && keys.length == 1) {
	                    var otherTouch = gestures[keys[0]].startTouch,
	                        disX = origin.clientX - otherTouch.clientX,
	                        disY = origin.clientY - otherTouch.clientY,
	                        centerX = (origin.clientX + otherTouch.clientX) / 2,
	                        centerY = (origin.clientY + otherTouch.clientY) / 2;
	                    gesture.other = gestures[keys[0]];
	                    gestures[keys[0]].other = gesture;
	                    curVetor = {
	                        centerX: centerX,
	                        centerY: centerY,
	                        pinch: false,
	                        deflection: false,
	                        distance: computeDistance(disX, disY)
	                    };
	
	                    initialAngle = computeDegree180(disX, disY);
	                }
	            }
	        });
	    }
	
	    // 处理 touchmove 事件
	    function touchMove(event) {
	        makeArray(event.changedTouches).forEach(function(touch, index) {
	            var gesture = gestures[touch.identifier],
	                flag = false;
	            if (gesture) {
	                var startTouch = gesture.startTouch,
	                    offsetX = touch.clientX - startTouch.clientX,
	                    offsetY = touch.clientY - startTouch.clientY;
	
	                if (gesture.status == 'tapping' || gesture.status == 'pressing') {
	                    if (computeDistance(offsetX, offsetY) > PAN_DISTANCE) {
	                        gesture.status = 'panning';
	                        // 记录移动开始的时间
	                        gesture.startMoveTime = Date.now();
	                        trigger(curElement, createPanEvent('pan', offsetX, offsetY, touch));
	                    }
	                } else if (gesture.status == 'panning') {
	                    trigger(curElement, createPanEvent('pan', offsetX, offsetY, touch));
	                }
	
	                if (supportMulti() && gesture.other && gesture.other.status != 'end') {
	                    var otherTouch = gesture.other.curTouch,
	                        disX = touch.clientX - otherTouch.clientX,
	                        disY = touch.clientY - otherTouch.clientY,
	                        centerX = (touch.clientX + otherTouch.clientX) / 2,
	                        centerY = (touch.clientY + otherTouch.clientY) / 2,
	                        distance = computeDistance(disX, disY);
	
	                    // 判断 pinch
	                    if (!curVetor.pinch) {
	                        if (Math.abs(curVetor.distance - distance) > PINCH_DIS) {
	                            curVetor.pinch = true;
	                            trigger(curElement, createMultiEvent('pinch', centerX, centerY, distance /
	                                curVetor.distance, void 0, touch, otherTouch));
	                        }
	                    } else {
	                        trigger(curElement, createMultiEvent('pinch', centerX, centerY, distance /
	                            curVetor.distance, void 0, touch, otherTouch));
	                    }
	
	                    // 判断 rorate
	                    if (!curVetor.deflection) {
	                        var rotation = getAngleDiff(disX, disY);
	                        if (Math.abs(rotation) > DIRECTION_DEG) {
	                            trigger(curElement, createMultiEvent('rotate', centerX, centerY, void 0, rotation, touch, otherTouch));
	                            curVetor.deflection = true;
	                        }
	                    } else {
	                        var rotation = getAngleDiff(disX, disY);
	                        trigger(curElement, createMultiEvent('rotate', centerX, centerY, void 0, rotation, touch, otherTouch));
	                    }
	
	                }
	
	                gesture.curTouch = mixTouchAttr({}, touch);
	            }
	        });
	    }
	
	    // 处理 touchend 事件
	    function touchEnd(event) {
	
	        makeArray(event.changedTouches).forEach(function(touch, index) {
	            var gesture = gestures[touch.identifier];
	            if (gesture) {
	
	                if (gesture.handler) {
	                    clearTimeout(gesture.handler);
	                    gesture.handler = null;
	                }
	
	                if (gesture.status == 'tapping') {
	                    trigger(curElement, mixTouchAttr(createEvent('tap'), touch));
	                } else if (gesture.status == 'pressing') {
	                    if (longTap) {
	                        trigger(curElement, mixTouchAttr(createEvent('tap'), touch));
	                    }
	                    trigger(curElement, mixTouchAttr(createEvent('pressend'), touch));
	                } else if (gesture.status == 'panning') {
	                    var startTouch = gesture.startTouch,
	                        offsetX = touch.clientX - startTouch.clientX,
	                        offsetY = touch.clientY - startTouch.clientY,
	                        duration = Date.now() - gesture.startMoveTime;
	                    trigger(curElement, createPanEvent('panend', offsetX, offsetY, touch, duration));
	                    // 判断是否是快速移动
	                    if (duration < FLICK_TIMEOUT) {
	                        trigger(curElement, createPanEvent('flick', offsetX, offsetY, touch, duration));
	                    }
	                }
	
	                if (supportMulti() && gesture.other && gesture.other.status != 'end') {
	                    var otherTouch = gesture.other.curTouch,
	                        disX = touch.clientX - otherTouch.clientX,
	                        disY = touch.clientY - otherTouch.clientY,
	                        centerX = (touch.clientX + otherTouch.clientX) / 2,
	                        centerY = (touch.clientY + otherTouch.clientY) / 2,
	                        distance = computeDistance(disX, disY);
	                    if (curVetor.pinch) {
	                        trigger(curElement, createMultiEvent('pinchend', centerX, centerY, distance /
	                            curVetor.distance, void 0, touch, otherTouch));
	                    }
	                    if (curVetor.deflection) {
	                        var rotation = getAngleDiff(disX, disY);
	                        trigger(curElement, createMultiEvent('rotatend', centerX, centerY, void 0, rotation, touch, otherTouch));
	
	
	                    }
	                    rotation = 0;
	                }
	
	                gesture.status = 'end';
	            }
	
	        });
	
	        if (checkEnd()) {
	            for (var key in gestures) {
	                delete gestures[key];
	            }
	        }
	    }
	
	    addEvent(body, 'touchstart', touchStart);
	    addEvent(body, 'touchmove', touchMove);
	    addEvent(body, 'touchend', touchEnd);
	
	    addEvent(body, 'tap', function(ev) {
	        var now = Date.now();
	        if (now - lastTapTime < DOUBLETAP_GAP) {
	            trigger(curElement, mixTouchAttr(createEvent('doubletap'), ev));
	            lastTapTime = 0;
	        } else {
	            lastTapTime = now;
	        }
	    });
	});
	
	var yGesture = {
	    enable: function() {
	        enabled= true;
	    },
	    disable: function() {
	        enabled = false;
	    },
	    disableLongTap: function() {
	        longTap = false;
	    }
	};
	
	
	if (typeof define === 'function' && typeof define.amd === 'object' && define.amd) {
	    define(function() {
	        return yGesture;
	    });
	} else if (typeof module !== 'undefined' && module.exports) {
	    module.exports = yGesture;
	} else {
	    window.yGesture = yGesture;
	}
	
})();