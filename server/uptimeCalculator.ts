/**
 * Pure function for calculating uptime percentage from events
 * Extracted for testability and validation
 */
export interface UptimeEvent {
  timestamp: Date;
  status: string;
}

export function calculateUptimeFromEvents(
  events: UptimeEvent[],
  startDate: Date,
  endDate: Date,
  priorEventStatus?: string
): number {
  const totalDuration = endDate.getTime() - startDate.getTime();
  
  if (totalDuration <= 0) {
    return 0;
  }

  // No events and no prior status means no monitoring data exists
  // for this period. Return 0% instead of assuming 100%.
  if (events.length === 0 && !priorEventStatus) {
    return 0;
  }

  let totalUptime = 0;

  // Sort events by timestamp
  const sortedEvents = [...events].sort((a, b) => 
    a.timestamp.getTime() - b.timestamp.getTime()
  );

  // Determine initial status
  let currentStatus: string;
  if (priorEventStatus) {
    // We know the status from before the window
    currentStatus = priorEventStatus;
  } else if (sortedEvents.length > 0) {
    // No prior event, infer from first event
    // If first event is "online", camera was offline before
    currentStatus = sortedEvents[0].status === "online" ? "offline" : "online";
  } else {
    // No events at all, assume online
    currentStatus = "online";
  }

  let currentTime = startDate.getTime();

  // Process each event
  for (const event of sortedEvents) {
    const eventTime = event.timestamp.getTime();

    // Count duration if camera was online
    if (currentStatus === "online") {
      totalUptime += eventTime - currentTime;
    }

    // Transition to new status
    currentStatus = event.status;
    currentTime = eventTime;
  }

  // Handle time after last event until end of window
  if (currentStatus === "online") {
    totalUptime += endDate.getTime() - currentTime;
  }

  return (totalUptime / totalDuration) * 100;
}
