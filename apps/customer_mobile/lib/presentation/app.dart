import 'package:flutter/material.dart';
import '../domain/entities/product.dart';
import '../application/use_cases/get_products_use_case.dart';
import '../domain/repositories/crypto_port.dart';
import '../domain/repositories/auth_port.dart';

class CustomerApp extends StatefulWidget {
  final GetProductsUseCase getProductsUseCase;
  final CryptoPort cryptoPort;
  final AuthPort authPort;

  const CustomerApp({
    super.key,
    required this.getProductsUseCase,
    required this.cryptoPort,
    required this.authPort,
  });

  @override
  State<CustomerApp> createState() => _CustomerAppState();
}

class _CustomerAppState extends State<CustomerApp> {
  bool _isAuthenticated = false;

  void _onLoginSuccess() {
    setState(() {
      _isAuthenticated = true;
    });
  }

  void _onLogout() {
    widget.authPort.logout().then((_) {
      setState(() {
        _isAuthenticated = false;
      });
    });
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Samplero Customer Portal',
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: Colors.deepPurple),
        useMaterial3: true,
      ),
      home: _isAuthenticated
          ? ProductListScreen(
              getProductsUseCase: widget.getProductsUseCase,
              cryptoPort: widget.cryptoPort,
              onLogout: _onLogout,
            )
          : LoginScreen(
              authPort: widget.authPort,
              onLoginSuccess: _onLoginSuccess,
            ),
    );
  }
}

class LoginScreen extends StatefulWidget {
  final AuthPort authPort;
  final VoidCallback onLoginSuccess;

  const LoginScreen({
    super.key,
    required this.authPort,
    required this.onLoginSuccess,
  });

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _emailController = TextEditingController();
  final _usernameController = TextEditingController();
  final _passwordController = TextEditingController();
  bool _isLoading = false;
  bool _isRegistering = false;
  String? _error;

  Future<void> _submit() async {
    setState(() {
      _isLoading = true;
      _error = null;
    });

    try {
      if (_isRegistering) {
        await widget.authPort.register(
          _usernameController.text.isNotEmpty ? _usernameController.text : _emailController.text,
          _emailController.text,
          _passwordController.text,
        );
      } else {
        await widget.authPort.login(
          _emailController.text,
          _passwordController.text,
        );
      }
      widget.onLoginSuccess();
    } catch (e) {
      setState(() {
        _error = e.toString();
      });
    } finally {
      if (mounted) {
        setState(() {
          _isLoading = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(_isRegistering ? 'Register' : 'Login to Samplero')),
      body: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            if (_isRegistering) ...[
              TextField(
                controller: _usernameController,
                decoration: const InputDecoration(labelText: 'Username'),
              ),
              const SizedBox(height: 16),
            ],
            TextField(
              controller: _emailController,
              decoration: const InputDecoration(labelText: 'Email'),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: _passwordController,
              decoration: const InputDecoration(labelText: 'Password'),
              obscureText: true,
            ),
            const SizedBox(height: 24),
            if (_error != null)
              Text(_error!, style: const TextStyle(color: Colors.red)),
            const SizedBox(height: 24),
            _isLoading
                ? const CircularProgressIndicator()
                : ElevatedButton(
                    onPressed: _submit,
                    child: Text(_isRegistering ? 'Register' : 'Login'),
                  ),
            TextButton(
              onPressed: () {
                setState(() {
                  _isRegistering = !_isRegistering;
                  _error = null;
                });
              },
              child: Text(_isRegistering ? 'Already have an account? Login' : 'Need an account? Register'),
            )
          ],
        ),
      ),
    );
  }
}

class ProductListScreen extends StatefulWidget {
  final GetProductsUseCase getProductsUseCase;
  final CryptoPort cryptoPort;
  final VoidCallback onLogout;

  const ProductListScreen({
    super.key,
    required this.getProductsUseCase,
    required this.cryptoPort,
    required this.onLogout,
  });

  @override
  State<ProductListScreen> createState() => _ProductListScreenState();
}

class _ProductListScreenState extends State<ProductListScreen> {
  late Future<List<Product>> _productsFuture;
  String _fingerprint = '';

  @override
  void initState() {
    super.initState();
    _productsFuture = widget.getProductsUseCase.execute();
    
    try {
      _fingerprint = widget.cryptoPort.generateDeviceFingerprint();
    } catch (e) {
      _fingerprint = 'Native lib not loaded: $e';
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Storefront'),
        actions: [
          IconButton(
            icon: const Icon(Icons.logout),
            onPressed: widget.onLogout,
          ),
        ],
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(20),
          child: Text('Device: $_fingerprint', style: const TextStyle(fontSize: 10)),
        ),
      ),
      body: FutureBuilder<List<Product>>(
        future: _productsFuture,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snapshot.hasError) {
            return Center(child: Text('Error: ${snapshot.error}'));
          }
          final products = snapshot.data ?? [];
          if (products.isEmpty) {
            return const Center(child: Text('No active products found.'));
          }

          return ListView.builder(
            itemCount: products.length,
            itemBuilder: (context, index) {
              final product = products[index];
              return ListTile(
                title: Text(product.name),
                subtitle: Text(product.description),
                trailing: Text('\$${(product.price.cents / 100).toStringAsFixed(2)}'),
                onTap: () {
                  // Navigate to details or checkout (Phase 2)
                },
              );
            },
          );
        },
      ),
    );
  }
}
