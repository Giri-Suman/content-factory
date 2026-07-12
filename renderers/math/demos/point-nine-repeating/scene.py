from manim import *


class MathScene(Scene):
    def construct(self):
        self.camera.background_color = "#0d1117"
        ACCENT = "#ffb224"

        # hook
        claim = Text("0.999... = 1", font_size=76, color=ACCENT, weight=BOLD)
        claim.move_to(UP * 1.8)
        self.play(Write(claim), run_time=1.4)
        sub = Text("exactly. not almost.", font_size=34, color=GREY_B)
        sub.next_to(claim, DOWN, buff=0.45)
        self.play(FadeIn(sub, shift=UP * 0.2), run_time=0.8)
        self.wait(2.2)
        self.play(FadeOut(sub), run_time=0.5)

        # the proof
        l1 = Text("x = 0.999...", font_size=42, color=WHITE)
        l2 = Text("10x = 9.999...", font_size=42, color=WHITE)
        l3 = Text("10x − x = 9.999... − 0.999...", font_size=36, color=WHITE)
        l4 = Text("9x = 9", font_size=48, color=WHITE)
        l5 = Text("x = 1", font_size=64, color=ACCENT, weight=BOLD)
        proof = VGroup(l1, l2, l3, l4, l5).arrange(DOWN, buff=0.55)
        proof.move_to(DOWN * 0.7)

        self.play(Write(l1), run_time=1.0)
        self.wait(1.2)
        self.play(Write(l2), run_time=1.0)
        self.wait(1.6)
        self.play(Write(l3), run_time=1.2)
        self.wait(2.0)
        self.play(Write(l4), run_time=0.9)
        self.play(Indicate(l4, color=ACCENT), run_time=1.0)
        self.wait(1.5)
        self.play(TransformFromCopy(l4, l5), run_time=1.0)
        self.play(Circumscribe(l5, color=ACCENT), run_time=1.2)
        self.wait(2.0)

        # the kicker
        self.play(FadeOut(proof, shift=DOWN * 0.5), run_time=0.7)
        kicker = Text("They're not two numbers\nthat are really close.", font_size=38, color=WHITE, line_spacing=1.1)
        kicker2 = Text("They're the same number,\nwritten two ways.", font_size=38, color=ACCENT, line_spacing=1.1)
        kicker.move_to(DOWN * 0.4)
        kicker2.move_to(DOWN * 0.4)
        self.play(FadeIn(kicker), run_time=1.0)
        self.wait(2.4)
        self.play(ReplacementTransform(kicker, kicker2), run_time=1.0)
        self.wait(3.0)
