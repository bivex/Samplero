import 'package:flutter/material.dart';
import '../domain/entities/product.dart';
import '../domain/entities/license.dart';
import '../application/use_cases/get_products_use_case.dart';
import '../domain/repositories/crypto_port.dart';
import '../domain/repositories/auth_port.dart';
import '../domain/repositories/license_repository.dart';

class CustomerApp extends StatefulWidget {
  final GetProductsUseCase getProductsUseCase;
  final CryptoPort cryptoPort;
  final AuthPort authPort;
  final LicenseRepository licenseRepository;

  const CustomerApp({
    super.key,
    required this.getProductsUseCase,
    required this.cryptoPort,
    required this.authPort,
    required this.licenseRepository,
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
              licenseRepository: widget.licenseRepository,
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
  final LicenseRepository licenseRepository;
  final VoidCallback onLogout;

  const ProductListScreen({
    super.key,
    required this.getProductsUseCase,
    required this.cryptoPort,
    required this.licenseRepository,
    required this.onLogout,
  });

  @override
  State<ProductListScreen> createState() => _ProductListScreenState();
}

class _ProductListScreenState extends State<ProductListScreen> {
  late Future<List<Product>> _productsFuture;
  List<License> _licenses = [];
  bool _licensesLoaded = false;
  String _fingerprint = '';

  @override
  void initState() {
    super.initState();
    _productsFuture = widget.getProductsUseCase.execute();

    try {
      _fingerprint = widget.cryptoPort.generateDeviceFingerprint();
    } catch (e) {
      _fingerprint = 'Error: $e';
    }

    _loadLicenses();
  }

  Future<void> _loadLicenses() async {
    try {
      final licenses = await widget.licenseRepository.getMyLicenses();
      if (mounted) {
        setState(() {
          _licenses = licenses;
          _licensesLoaded = true;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _licensesLoaded = true;
        });
      }
    }
  }

  License? _licenseForProduct(Product product) {
    for (final lic in _licenses) {
      if (lic.product.slug == product.slug) return lic;
    }
    return null;
  }

  Color _statusColor(String status) {
    switch (status) {
      case 'active':
        return Colors.green;
      case 'revoked':
        return Colors.red;
      case 'expired':
        return Colors.orange;
      default:
        return Colors.grey;
    }
  }

  IconData _statusIcon(String status) {
    switch (status) {
      case 'active':
        return Icons.check_circle;
      case 'revoked':
        return Icons.cancel;
      case 'expired':
        return Icons.warning;
      default:
        return Icons.help_outline;
    }
  }

  String _formatDate(DateTime? dt) {
    if (dt == null) return '-';
    return '${dt.day.toString().padLeft(2, '0')}.${dt.month.toString().padLeft(2, '0')}.${dt.year}';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('My Products'),
        actions: [
          IconButton(
            icon: const Icon(Icons.logout),
            onPressed: widget.onLogout,
          ),
        ],
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(20),
          child: Padding(
            padding: const EdgeInsets.only(bottom: 6),
            child: Text('Device: ${_fingerprint.substring(0, 16)}...',
                style: const TextStyle(fontSize: 10, color: Colors.grey)),
          ),
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
            return const Center(child: Text('No products found.'));
          }

          return RefreshIndicator(
            onRefresh: () async {
              setState(() {
                _productsFuture = widget.getProductsUseCase.execute();
              });
              await _loadLicenses();
            },
            child: ListView.builder(
              itemCount: products.length,
              padding: const EdgeInsets.all(12),
              itemBuilder: (context, index) {
                final product = products[index];
                final license = _licenseForProduct(product);
                return _ProductCard(
                  product: product,
                  license: license,
                  licensesLoaded: _licensesLoaded,
                  statusColor: _statusColor,
                  statusIcon: _statusIcon,
                  formatDate: _formatDate,
                );
              },
            ),
          );
        },
      ),
    );
  }
}

class _ProductCard extends StatelessWidget {
  final Product product;
  final License? license;
  final bool licensesLoaded;
  final Color Function(String) statusColor;
  final IconData Function(String) statusIcon;
  final String Function(DateTime?) formatDate;

  const _ProductCard({
    required this.product,
    required this.license,
    required this.licensesLoaded,
    required this.statusColor,
    required this.statusIcon,
    required this.formatDate,
  });

  @override
  Widget build(BuildContext context) {
    final hasLicense = license != null;

    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      elevation: hasLicense ? 2 : 0.5,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: hasLicense
            ? BorderSide(color: statusColor(license!.status).withValues(alpha: 0.4), width: 1.5)
            : BorderSide.none,
      ),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Header: product name + status badge
            Row(
              children: [
                Expanded(
                  child: Text(
                    product.name,
                    style: Theme.of(context).textTheme.titleMedium?.copyWith(
                          fontWeight: FontWeight.bold,
                        ),
                  ),
                ),
                if (!licensesLoaded)
                  const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                else if (hasLicense)
                  _StatusBadge(
                    status: license!.status,
                    color: statusColor(license!.status),
                    icon: statusIcon(license!.status),
                  )
                else
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                    decoration: BoxDecoration(
                      color: Colors.grey.shade200,
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: const Text(
                      'No license',
                      style: TextStyle(fontSize: 12, color: Colors.grey),
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 8),

            Text(
              product.description,
              style: TextStyle(fontSize: 13, color: Colors.grey.shade600),
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
            const SizedBox(height: 12),

            // License details row
            if (hasLicense) ...[
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.grey.shade50,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Column(
                  children: [
                    _InfoRow(
                      label: 'License Key',
                      value: license!.licenseKeyMasked,
                    ),
                    const SizedBox(height: 6),
                    _InfoRow(
                      label: 'Activations',
                      value: '${license!.activeActivationsCount} / ${license!.activationLimit} used',
                    ),
                    const SizedBox(height: 6),
                    _InfoRow(
                      label: 'Expires',
                      value: license!.hasExpiry ? formatDate(license!.expiresAt) : 'Never',
                    ),
                    if (license!.activations.isNotEmpty) ...[
                      const SizedBox(height: 8),
                      const Divider(height: 1),
                      const SizedBox(height: 8),
                      Text('Active Devices',
                          style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: Colors.grey.shade700)),
                      const SizedBox(height: 4),
                      ...license!.activations.where((a) => a.active).map((a) => Padding(
                            padding: const EdgeInsets.only(top: 4),
                            child: Row(
                              children: [
                                Icon(Icons.devices, size: 14, color: Colors.grey.shade500),
                                const SizedBox(width: 6),
                                Expanded(
                                  child: Text(
                                    a.deviceFingerprint.length > 24
                                        ? '${a.deviceFingerprint.substring(0, 24)}...'
                                        : a.deviceFingerprint,
                                    style: TextStyle(fontSize: 11, color: Colors.grey.shade600),
                                  ),
                                ),
                                if (a.platform != null)
                                  Container(
                                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                    decoration: BoxDecoration(
                                      color: Colors.blue.shade50,
                                      borderRadius: BorderRadius.circular(4),
                                    ),
                                    child: Text(a.platform!,
                                        style: TextStyle(fontSize: 10, color: Colors.blue.shade700)),
                                  ),
                              ],
                            ),
                          )),
                    ],
                  ],
                ),
              ),
            ] else if (licensesLoaded) ...[
              Row(
                children: [
                  Icon(Icons.lock_outline, size: 16, color: Colors.grey.shade400),
                  const SizedBox(width: 6),
                  Text(
                    'Purchase a license to activate this product',
                    style: TextStyle(fontSize: 12, color: Colors.grey.shade500),
                  ),
                ],
              ),
            ],

            // Price
            if (!hasLicense) ...[
              const SizedBox(height: 12),
              Row(
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  Text(
                    '\$${(product.price.cents / 100).toStringAsFixed(2)}',
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w600,
                      color: Theme.of(context).colorScheme.primary,
                    ),
                  ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _StatusBadge extends StatelessWidget {
  final String status;
  final Color color;
  final IconData icon;

  const _StatusBadge({
    required this.status,
    required this.color,
    required this.icon,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 14, color: color),
          const SizedBox(width: 4),
          Text(
            status.toUpperCase(),
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.bold,
              color: color,
            ),
          ),
        ],
      ),
    );
  }
}

class _InfoRow extends StatelessWidget {
  final String label;
  final String value;

  const _InfoRow({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(label, style: TextStyle(fontSize: 12, color: Colors.grey.shade500)),
        Flexible(
          child: Text(value,
              style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w500),
              overflow: TextOverflow.ellipsis),
        ),
      ],
    );
  }
}
