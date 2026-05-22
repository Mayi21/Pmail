/**
 * User Table Component
 * Displays users with management actions
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TierBadge } from '../TierBadge';
import ConfirmDialog from '../ConfirmDialog';

interface User {
  id: number;
  username: string;
  email: string;
  role: 'user' | 'admin';
  tier_id: number;
  tier_name: string;
  tier_display_name: string;
  tier_expires_at: string | null;
  created_at: string;
  total_mailboxes: number;
  total_emails: number;
}

interface UserTableProps {
  users: User[];
  onUpgradeTier: (userId: number) => void;
  onChangeRole: (userId: number, role: 'user' | 'admin') => void;
  onDeleteUser: (userId: number) => void;
}

export default function UserTable({
  users,
  onUpgradeTier,
  onChangeRole,
  onDeleteUser,
}: UserTableProps) {
  const { t } = useTranslation();

  // State for role change confirmation
  const [showChangeRoleDialog, setShowChangeRoleDialog] = useState(false);
  const [roleChangeTarget, setRoleChangeTarget] = useState<{
    userId: number;
    username: string;
    newRole: 'user' | 'admin';
  } | null>(null);

  // State for delete user confirmation
  const [showDeleteUserDialog, setShowDeleteUserDialog] = useState(false);
  const [userToDelete, setUserToDelete] = useState<{
    userId: number;
    username: string;
  } | null>(null);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatExpiresAt = (dateString: string | null) => {
    if (!dateString) return <span className="text-gray-500">{t('admin.users.never')}</span>;

    const expiresDate = new Date(dateString);
    const now = new Date();
    const isExpired = expiresDate <= now;

    return (
      <span className={isExpired ? 'text-red-600 font-bold' : 'text-gray-700'}>
        {isExpired ? t('admin.users.expired') : formatDate(dateString)}
      </span>
    );
  };

  // Handle role change request
  const handleChangeRoleClick = (user: User) => {
    const newRole = user.role === 'admin' ? 'user' : 'admin';
    setRoleChangeTarget({
      userId: user.id,
      username: user.username,
      newRole,
    });
    setShowChangeRoleDialog(true);
  };

  // Confirm role change
  const confirmChangeRole = () => {
    if (roleChangeTarget) {
      onChangeRole(roleChangeTarget.userId, roleChangeTarget.newRole);
    }
    setShowChangeRoleDialog(false);
    setRoleChangeTarget(null);
  };

  // Handle delete user request
  const handleDeleteUserClick = (user: User) => {
    setUserToDelete({
      userId: user.id,
      username: user.username,
    });
    setShowDeleteUserDialog(true);
  };

  // Confirm delete user
  const confirmDeleteUser = () => {
    if (userToDelete) {
      onDeleteUser(userToDelete.userId);
    }
    setShowDeleteUserDialog(false);
    setUserToDelete(null);
  };

  return (
    <div className="w-full overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full bg-white border-4 border-neo-black table-fixed">
        <thead className="bg-blue-300">
          <tr>
            <th className="w-[10%] px-3 py-3 border-b-4 border-neo-black text-left font-black uppercase text-xs">
              {t('admin.users.tableHeaders.user')}
            </th>
            <th className="w-[22%] px-3 py-3 border-b-4 border-neo-black text-left font-black uppercase text-xs">
              {t('admin.users.tableHeaders.email')}
            </th>
            <th className="w-[10%] px-3 py-3 border-b-4 border-neo-black text-left font-black uppercase text-xs">
              {t('admin.users.tableHeaders.role')}
            </th>
            <th className="w-[11%] px-3 py-3 border-b-4 border-neo-black text-left font-black uppercase text-xs">
              {t('admin.users.tableHeaders.tier')}
            </th>
            <th className="w-[10%] px-3 py-3 border-b-4 border-neo-black text-left font-black uppercase text-xs">
              {t('admin.users.tableHeaders.expires')}
            </th>
            <th className="w-[7%] px-3 py-3 border-b-4 border-neo-black text-center font-black uppercase text-xs">
              {t('admin.users.tableHeaders.mailboxes')}
            </th>
            <th className="w-[12%] px-3 py-3 border-b-4 border-neo-black text-left font-black uppercase text-xs">
              {t('admin.users.tableHeaders.joined')}
            </th>
            <th className="w-[18%] px-3 py-3 border-b-4 border-neo-black text-center font-black uppercase text-xs">
              {t('admin.users.tableHeaders.actions')}
            </th>
          </tr>
        </thead>
        <tbody>
          {users.map((user, index) => (
            <tr
              key={user.id}
              className={`
                border-b-4 border-neo-black
                ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}
                hover:bg-yellow-50 transition-colors
              `}
            >
              <td className="px-3 py-3 font-bold">
                <div className="truncate text-sm" title={user.username}>
                  {user.username}
                </div>
              </td>
              <td className="px-3 py-3">
                <div className="truncate text-xs" title={user.email}>
                  {user.email}
                </div>
              </td>
              <td className="px-3 py-3">
                <span
                  className={`
                    inline-flex items-center px-2 py-1 rounded border-2 border-neo-black font-bold text-xs whitespace-nowrap
                    ${user.role === 'admin' ? 'bg-purple-300' : 'bg-gray-300'}
                  `}
                >
                  {user.role === 'admin' ? '👑' : '👤'}
                </span>
              </td>
              <td className="px-3 py-3">
                <div className="scale-90 origin-left">
                  <TierBadge
                    tierName={user.tier_name}
                    displayName={user.tier_display_name}
                    size="sm"
                  />
                </div>
              </td>
              <td className="px-3 py-3">
                <div className="text-xs">
                  {formatExpiresAt(user.tier_expires_at)}
                </div>
              </td>
              <td className="px-3 py-3 text-center">
                <span className="font-bold text-base">{user.total_mailboxes}</span>
              </td>
              <td className="px-3 py-3">
                <div className="text-xs whitespace-nowrap">
                  {formatDate(user.created_at)}
                </div>
              </td>
              <td className="px-3 py-3">
                <div className="flex items-center justify-center gap-1.5">
                  <button
                    onClick={() => onUpgradeTier(user.id)}
                    className="px-2.5 py-1.5 bg-green-300 border-2 border-neo-black rounded
                             text-base hover:shadow-neo-sm
                             transition-all"
                    title={t('admin.users.upgradeTier')}
                  >
                    🏆
                  </button>
                  <button
                    onClick={() => handleChangeRoleClick(user)}
                    className="px-2.5 py-1.5 bg-purple-300 border-2 border-neo-black rounded
                             text-base hover:shadow-neo-sm
                             transition-all"
                    title={t('admin.users.changeRole')}
                  >
                    {user.role === 'admin' ? '👤' : '👑'}
                  </button>
                  <button
                    onClick={() => handleDeleteUserClick(user)}
                    className="px-2.5 py-1.5 bg-red-300 border-2 border-neo-black rounded
                             text-base hover:shadow-neo-sm
                             transition-all"
                    title={t('admin.users.deleteUser')}
                  >
                    🗑️
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>

      {/* Role Change Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showChangeRoleDialog}
        title={t('common.confirm')}
        message={
          roleChangeTarget
            ? t('admin.users.confirmChangeRole', {
                username: roleChangeTarget.username,
                role: roleChangeTarget.newRole,
              })
            : ''
        }
        confirmText={t('common.confirm')}
        cancelText={t('common.cancel')}
        confirmButtonClass="bg-purple-600 hover:bg-purple-700"
        onConfirm={confirmChangeRole}
        onCancel={() => {
          setShowChangeRoleDialog(false);
          setRoleChangeTarget(null);
        }}
      />

      {/* Delete User Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showDeleteUserDialog}
        title={t('common.confirm')}
        message={
          userToDelete
            ? t('admin.users.confirmDelete', { username: userToDelete.username })
            : ''
        }
        confirmText={t('common.delete')}
        cancelText={t('common.cancel')}
        confirmButtonClass="bg-red-600 hover:bg-red-700"
        onConfirm={confirmDeleteUser}
        onCancel={() => {
          setShowDeleteUserDialog(false);
          setUserToDelete(null);
        }}
      />
    </div>
  );
}
