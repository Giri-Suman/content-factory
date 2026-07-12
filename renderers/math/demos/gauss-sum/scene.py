from manim import *


class MathScene(Scene):
    def construct(self):
        self.camera.background_color = "#0d1117"
        ACCENT = "#ffb224"

        # hook: the claim
        claim = Text("1 + 2 + ... + 100", font_size=52, color=WHITE)
        equals = Text("= 5050", font_size=72, color=ACCENT, weight=BOLD)
        equals.next_to(claim, DOWN, buff=0.4)
        group = VGroup(claim, equals).move_to(UP * 1.6)
        self.play(Write(claim), run_time=1.2)
        self.play(FadeIn(equals, scale=1.4), run_time=0.8)
        self.wait(1.5)

        sub = Text("in 3 seconds, no calculator", font_size=30, color=GREY_B)
        sub.next_to(group, DOWN, buff=0.5)
        self.play(FadeIn(sub), run_time=0.7)
        self.wait(1.8)
        self.play(FadeOut(sub), run_time=0.5)

        # the pairing trick — columns spaced so the wide bottom numbers don't collide
        cols = [-1.7, -0.85, 0.0, 0.85, 1.7]
        top_syms = ["1", "2", "3", "...", "50"]
        bot_syms = ["100", "99", "98", "...", "51"]
        top = VGroup()
        bot = VGroup()
        for x, ts, bs in zip(cols, top_syms, bot_syms):
            t = Text(ts, font_size=32, color=WHITE).move_to([x, -0.6, 0])
            b = Text(bs, font_size=32, color=WHITE).move_to([x, -1.7, 0])
            top.add(t)
            bot.add(b)
        self.play(LaggedStart(*[FadeIn(t, shift=DOWN * 0.3) for t in top], lag_ratio=0.15), run_time=1.5)
        self.play(LaggedStart(*[FadeIn(t, shift=UP * 0.3) for t in bot], lag_ratio=0.15), run_time=1.5)
        self.wait(1.0)

        arcs = VGroup()
        sums = VGroup()
        for i, (a, b) in enumerate(zip(top, bot)):
            if i == 3:
                continue
            arc = ArcBetweenPoints(a.get_bottom() + DOWN * 0.08, b.get_top() + UP * 0.08, angle=-TAU / 6, color=ACCENT)
            arcs.add(arc)
            s = Text("101", font_size=24, color=ACCENT)
            s.move_to((a.get_center() + b.get_center()) / 2)
            sums.add(s)
        self.play(LaggedStart(*[Create(a) for a in arcs], lag_ratio=0.2), run_time=2.0)
        self.play(LaggedStart(*[FadeIn(s, scale=1.3) for s in sums], lag_ratio=0.2), run_time=1.6)
        self.wait(2.0)

        # the punchline: 50 pairs of 101
        pairs = Text("50 pairs × 101", font_size=44, color=WHITE)
        result = Text("= 5050", font_size=64, color=ACCENT, weight=BOLD)
        stack = VGroup(pairs, result).arrange(DOWN, buff=0.4).move_to(DOWN * 0.9)
        keep = VGroup(claim, equals)
        self.play(
            FadeOut(top), FadeOut(bot), FadeOut(arcs), FadeOut(sums),
            run_time=0.8,
        )
        self.play(Write(pairs), run_time=1.2)
        self.play(TransformFromCopy(pairs, result), run_time=1.0)
        self.play(Circumscribe(result, color=ACCENT), run_time=1.2)
        self.wait(2.2)

        # the kid who saw it
        tag = Text("Gauss saw this at age 8.", font_size=32, color=GREY_B)
        tag.next_to(stack, DOWN, buff=0.8)
        self.play(FadeIn(tag, shift=UP * 0.2), run_time=0.9)
        self.wait(3.0)
