import 'package:flutter/material.dart';

class VoiceWaveformBars extends StatelessWidget {
  const VoiceWaveformBars({
    required this.samples,
    required this.activeColor,
    required this.inactiveColor,
    super.key,
  });

  final List<double> samples;
  final Color activeColor;
  final Color inactiveColor;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 64,
      child: Row(
        children: samples
            .map(
              (double sample) => Expanded(
                child: Align(
                  alignment: Alignment.center,
                  child: Container(
                    width: 4,
                    height: 16 + (sample * 40),
                    decoration: BoxDecoration(
                      color: Color.lerp(inactiveColor, activeColor, sample),
                      borderRadius: BorderRadius.circular(999),
                    ),
                  ),
                ),
              ),
            )
            .toList(growable: false),
      ),
    );
  }
}
