import 'package:flutter/material.dart';

void main() {
  runApp(const BahuApp());
}

class BahuApp extends StatelessWidget {
  const BahuApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Bahu ERP',
      home: Scaffold(
        appBar: AppBar(title: const Text('Bahu ERP Mobile')),
        body: const Center(
          child: Text('App shell ready. Connect screens to shared FastAPI workflows.'),
        ),
      ),
    );
  }
}
