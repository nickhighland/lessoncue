package org.lessoncue.personaltest

class SlideNavigator(private val count: Int, initialIndex: Int = 0) {
    var index: Int = initialIndex.coerceIn(0, (count - 1).coerceAtLeast(0))
        private set

    fun next(): Int {
        if (index < count - 1) index += 1
        return index
    }

    fun previous(): Int {
        if (index > 0) index -= 1
        return index
    }
}
