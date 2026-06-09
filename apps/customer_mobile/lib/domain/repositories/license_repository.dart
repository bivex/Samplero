import '../entities/license.dart';

abstract class LicenseRepository {
  Future<List<License>> getMyLicenses();
}
