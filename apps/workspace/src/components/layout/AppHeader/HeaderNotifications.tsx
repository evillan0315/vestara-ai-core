import NotificationsRoundedIcon from '@mui/icons-material/NotificationsRounded';

export interface HeaderNotificationsProps {
  count?: number;
}

export default function HeaderNotifications({ count = 0 }: HeaderNotificationsProps) {
  return (
    <button
      className="relative flex items-center justify-center w-10 h-10 rounded-xl  transition-colors"
      aria-label="Notifications"
    >
      <NotificationsRoundedIcon fontSize="small" />

      {count > 0 && (
        <span className="absolute top-2 right-2 flex items-center justify-center min-w-4 h-4 px-1 rounded-full bg-red-500 text-[10px] font-semibold text-white">
          {count > 99 ? '99+' : count}
        </span>
      )}
    </button>
  );
}
