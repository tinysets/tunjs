
export function hashCode(strKey) {
    var hash = 0;
    if (strKey != null) {
        for (var i = 0; i < strKey.length; i++) {
            hash = hash * 31 + strKey.charCodeAt(i);
            hash = uintValue(hash);
        }
    }
    return hash;
}


function uintValue(num) {
    // https://developer.mozilla.org/zh-CN/docs/Web/JavaScript/Reference/Global_Objects/Number
    // https://developer.mozilla.org/zh-CN/docs/Web/JavaScript/Reference/Operators#bitwise_shift_operators
    // 位运算符规则
    // 1.浮点数去掉小数后变成整数
    // 2.将整数取低32位变成int32
    // 3.>>> 无符号右移 返回的结果是uint32
    // 4.其他位运算符 返回的结果是int32

    num &= 0xFFFFFFFF // int32
    return num >>> 0; // uint32
}