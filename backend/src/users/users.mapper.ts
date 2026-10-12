import { User } from './entities/user.entity';
import { UserResponseDto } from './dto/user.dto';

export const toUserResponse = (user: User): UserResponseDto => ({
  id: user.id,
  email: user.email,
  firstName: user.firstName,
  lastName: user.lastName,
  avatarUrl: user.avatarUrl,
  phone: user.phone,
  timezone: user.timezone,
  roles: (user.roles ?? []).map((r) => r.name),
  createdAt: user.createdAt,
});
