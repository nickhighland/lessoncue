package org.lessoncue.personaltest

import android.os.Bundle
import android.view.KeyEvent
import androidx.activity.compose.BackHandler
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.focusable
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

private val Ink = Color(0xFF173B36)
private val Mint = Color(0xFF3A8B66)
private val Paper = Color(0xFFF2F0E8)
private val slides = intArrayOf(R.drawable.slide_1, R.drawable.slide_2, R.drawable.slide_3)

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent { MaterialTheme { LessonCuePersonalTest() } }
    }
}

@Composable
private fun LessonCuePersonalTest() {
    var viewingLesson by remember { mutableStateOf(false) }
    Surface(Modifier.fillMaxSize(), color = Paper) {
        if (viewingLesson) {
            SlideViewer(onClose = { viewingLesson = false })
        } else {
            LessonChooser(onOpen = { viewingLesson = true })
        }
    }
}

@Composable
private fun LessonChooser(onOpen: () -> Unit) {
    Box(Modifier.fillMaxSize().background(Paper).padding(36.dp), contentAlignment = Alignment.Center) {
        Column(
            Modifier.widthIn(max = 720.dp).background(Color.White, RoundedCornerShape(24.dp)).padding(36.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            Text("LessonCue", color = Mint, fontSize = 16.sp, fontWeight = FontWeight.Bold)
            Text("Choose a lesson", color = Ink, fontSize = 40.sp, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(8.dp))
            Text("Sample Lesson", color = Ink, fontSize = 30.sp, fontWeight = FontWeight.SemiBold)
            Text("Schools Project • 3 slides", color = Color(0xFF52635E), fontSize = 19.sp)
            Button(
                onClick = onOpen,
                colors = ButtonDefaults.buttonColors(containerColor = Mint),
                modifier = Modifier.fillMaxWidth()
            ) { Text("Open Sample Lesson", fontSize = 20.sp) }
        }
    }
}

@Composable
private fun SlideViewer(onClose: () -> Unit) {
    var index by remember { mutableIntStateOf(0) }
    var dragDistance by remember { mutableFloatStateOf(0f) }
    val focusRequester = remember { FocusRequester() }
    fun next() { if (index < slides.lastIndex) index += 1 }
    fun previous() { if (index > 0) index -= 1 }

    Box(
        Modifier
            .fillMaxSize()
            .background(Color(0xFF101614))
            .focusRequester(focusRequester)
            .focusable()
            .onPreviewKeyEvent { event ->
                val native = event.nativeKeyEvent
                if (native.action != KeyEvent.ACTION_DOWN) return@onPreviewKeyEvent false
                when (native.keyCode) {
                    KeyEvent.KEYCODE_DPAD_RIGHT,
                    KeyEvent.KEYCODE_MEDIA_NEXT,
                    KeyEvent.KEYCODE_DPAD_CENTER,
                    KeyEvent.KEYCODE_ENTER,
                    KeyEvent.KEYCODE_NUMPAD_ENTER -> { next(); true }
                    KeyEvent.KEYCODE_DPAD_LEFT,
                    KeyEvent.KEYCODE_MEDIA_PREVIOUS -> { previous(); true }
                    else -> false
                }
            }
            .pointerInput(index) {
                detectHorizontalDragGestures(
                    onDragStart = { dragDistance = 0f },
                    onHorizontalDrag = { _, amount -> dragDistance += amount },
                    onDragEnd = {
                        if (dragDistance < -80f) next()
                        if (dragDistance > 80f) previous()
                        dragDistance = 0f
                    }
                )
            }
    ) {
        if (index == 1) {
            CorrectedSecondSlide()
        } else {
            Image(
                painter = painterResource(slides[index]),
                contentDescription = "Sample Lesson slide ${index + 1} of ${slides.size}",
                contentScale = ContentScale.Fit,
                modifier = Modifier.fillMaxSize()
            )
        }
        Row(
            Modifier.align(Alignment.BottomCenter).fillMaxWidth().background(Color(0xE6173B36)).padding(12.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Button(onClick = { previous() }, enabled = index > 0) { Text("Previous") }
            Text("Swipe or use ◀  ▶ on a remote", color = Color.White, fontSize = 16.sp)
            Button(onClick = { next() }, enabled = index < slides.lastIndex) { Text("Next") }
        }
    }
    BackHandler(onBack = onClose)
    LaunchedEffect(Unit) { focusRequester.requestFocus() }
}

@Composable
private fun CorrectedSecondSlide() {
    Box(Modifier.fillMaxSize().background(Color.White), contentAlignment = Alignment.Center) {
        Column(
            Modifier.fillMaxWidth().padding(horizontal = 64.dp),
            verticalArrangement = Arrangement.spacedBy(24.dp)
        ) {
            Text(
                "This demo app shows a sample LessonCue project with three slides. It is a basic demonstration of the touch screen experience. On the TV version, the slides are controlled with a television, Google TV, or Fire TV remote.",
                color = Color.Black,
                fontSize = 32.sp,
                lineHeight = 48.sp
            )
            Text("2 of 3", color = Color.Black, fontSize = 32.sp)
            Text(
                "Slide left to right to test backward navigation. Then slide right to left twice to advance to the final slide.",
                color = Color.Black,
                fontSize = 25.sp,
                lineHeight = 36.sp
            )
        }
    }
}
